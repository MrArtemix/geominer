"""
MQTT Ingestor for AquaGuard IoT telemetry.

Subscribes to sensor topics on the MQTT broker, persists every reading to
the ``sensor_readings`` PostgreSQL table, and publishes threshold-breach
alerts to the ``alerts:new`` Redis Stream.

OMS drinking-water thresholds checked on every message:
  - mercury       > 0.001 mg/L
  - pH            outside [6.5, 8.5]
  - turbidity     > 5 NTU
  - dissolved_oxygen < 5 mg/L
"""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone

import paho.mqtt.client as mqtt
import redis
import structlog
from sqlalchemy import create_engine, text

log = structlog.get_logger()

# ---------------------------------------------------------------------------
# Configuration (env vars with sensible defaults)
# ---------------------------------------------------------------------------
MQTT_BROKER = os.getenv("MQTT_BROKER", "mosquitto")
MQTT_BROKER_PORT = int(os.getenv("MQTT_BROKER_PORT", "1883"))
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:postgres@localhost:5432/geominer",
)
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

# ---------------------------------------------------------------------------
# Database & Redis clients
# ---------------------------------------------------------------------------
engine = create_engine(DATABASE_URL, pool_pre_ping=True)
redis_client = redis.Redis.from_url(REDIS_URL, decode_responses=True)

# ---------------------------------------------------------------------------
# OMS thresholds
# ---------------------------------------------------------------------------
OMS_THRESHOLDS: dict[str, dict] = {
    "mercury": {"max": 0.001, "unit": "mg/L"},
    "ph": {"min": 6.5, "max": 8.5, "unit": "pH"},
    "turbidity": {"max": 5.0, "unit": "NTU"},
    "dissolved_oxygen": {"min": 5.0, "unit": "mg/L"},
}

# Topics to subscribe to
TOPICS = [
    "aquaguard/+/turbidity",
    "aquaguard/+/ph",
    "aquaguard/+/mercury",
    "aquaguard/+/dissolved_oxygen",
    "aquaguard/+/conductivity",
]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _persist_reading(
    sensor_id: str,
    parameter: str,
    value: float,
    unit: str,
    timestamp: str,
    battery: float | None,
    lat: float | None,
    lon: float | None,
) -> None:
    """Insert a single sensor reading into PostgreSQL."""
    insert = text("""
        INSERT INTO sensor_readings
            (sensor_id, parameter, value, unit, timestamp, battery, lat, lon)
        VALUES
            (:sensor_id, :parameter, :value, :unit, :timestamp, :battery, :lat, :lon)
    """)
    with engine.begin() as conn:
        conn.execute(
            insert,
            {
                "sensor_id": sensor_id,
                "parameter": parameter,
                "value": value,
                "unit": unit,
                "timestamp": timestamp,
                "battery": battery,
                "lat": lat,
                "lon": lon,
            },
        )


def _check_thresholds(
    sensor_id: str,
    parameter: str,
    value: float,
    unit: str,
    timestamp: str,
    lat: float | None,
    lon: float | None,
) -> None:
    """Evaluate OMS thresholds and publish an alert to Redis if breached."""
    threshold = OMS_THRESHOLDS.get(parameter)
    if threshold is None:
        return  # no threshold defined for this parameter (e.g. conductivity)

    breached = False
    detail = ""

    if "max" in threshold and value > threshold["max"]:
        breached = True
        detail = f"{parameter} {value} {unit} exceeds OMS max {threshold['max']} {threshold['unit']}"
    if "min" in threshold and value < threshold["min"]:
        breached = True
        detail = f"{parameter} {value} {unit} below OMS min {threshold['min']} {threshold['unit']}"

    if breached:
        alert = {
            "sensor_id": sensor_id,
            "parameter": parameter,
            "value": str(value),
            "unit": unit,
            "threshold_detail": detail,
            "timestamp": timestamp,
            "lat": str(lat) if lat is not None else "",
            "lon": str(lon) if lon is not None else "",
            "severity": "critical" if parameter == "mercury" else "warning",
        }
        redis_client.xadd("alerts:new", alert)
        log.warning(
            "threshold_breached",
            sensor_id=sensor_id,
            parameter=parameter,
            value=value,
            detail=detail,
        )


# ---------------------------------------------------------------------------
# MQTT callbacks (paho-mqtt v2 API)
# ---------------------------------------------------------------------------

def on_connect(client: mqtt.Client, userdata, flags, reason_code, properties=None):
    """Called when the client connects to the broker."""
    if reason_code == 0:
        log.info("mqtt.connected", broker=MQTT_BROKER, port=MQTT_BROKER_PORT)
        for topic in TOPICS:
            client.subscribe(topic, qos=1)
            log.info("mqtt.subscribed", topic=topic)
    else:
        log.error("mqtt.connection_failed", reason_code=reason_code)


def on_message(client: mqtt.Client, userdata, message: mqtt.MQTTMessage):
    """Called for every received MQTT message."""
    try:
        # Topic format: aquaguard/<sensor_id>/<parameter>
        parts = message.topic.split("/")
        if len(parts) != 3:
            log.warning("mqtt.unexpected_topic", topic=message.topic)
            return

        _, sensor_id, parameter = parts
        payload = json.loads(message.payload.decode("utf-8"))

        value = float(payload["value"])
        unit = str(payload.get("unit", ""))
        timestamp = payload.get("timestamp", datetime.now(timezone.utc).isoformat())
        battery = payload.get("battery")
        lat = payload.get("lat")
        lon = payload.get("lon")

        log.info(
            "mqtt.reading_received",
            sensor_id=sensor_id,
            parameter=parameter,
            value=value,
        )

        # Persist to PostgreSQL
        _persist_reading(sensor_id, parameter, value, unit, timestamp, battery, lat, lon)

        # Evaluate OMS thresholds
        _check_thresholds(sensor_id, parameter, value, unit, timestamp, lat, lon)

    except (json.JSONDecodeError, KeyError, ValueError) as exc:
        log.error(
            "mqtt.message_parse_error",
            topic=message.topic,
            error=str(exc),
        )


def on_disconnect(client: mqtt.Client, userdata, flags, reason_code, properties=None):
    """Called when the client disconnects from the broker."""
    log.warning("mqtt.disconnected", reason_code=reason_code)


# ---------------------------------------------------------------------------
# Entry point (called from main.py in a background thread)
# ---------------------------------------------------------------------------

def start_mqtt_subscriber() -> None:
    """Create an MQTT client and run the network loop forever."""
    client = mqtt.Client(
        callback_api_version=mqtt.CallbackAPIVersion.VERSION2,
        client_id="aquaguard-ingestor",
        protocol=mqtt.MQTTv5,
    )
    client.on_connect = on_connect
    client.on_message = on_message
    client.on_disconnect = on_disconnect

    log.info("mqtt.connecting", broker=MQTT_BROKER, port=MQTT_BROKER_PORT)
    client.connect(MQTT_BROKER, MQTT_BROKER_PORT, keepalive=60)
    client.loop_forever()
