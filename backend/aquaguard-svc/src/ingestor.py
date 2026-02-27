"""
Ingesteur MQTT AquaGuard avec reconnexion, TimescaleDB et seuils OMS.

Souscrit aux topics capteurs, persiste dans sensor_readings (hypertable),
et declenche des alertes via HTTP vers alertflow-svc quand les seuils sont depasses.
"""

from __future__ import annotations

import json
import os
import time
from datetime import datetime, timezone

import httpx
import paho.mqtt.client as mqtt
import structlog
from sqlalchemy import create_engine, text

log = structlog.get_logger()

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
MQTT_BROKER = os.getenv("MQTT_BROKER", "mosquitto")
MQTT_BROKER_PORT = int(os.getenv("MQTT_BROKER_PORT", "1883"))
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://geominer:geominer2026@postgres:5432/geominerdb",
)
ALERTFLOW_URL = os.getenv("ALERTFLOW_URL", "http://alertflow-svc:8003")

# Intervalle de reconnexion (secondes)
RECONNECT_MIN_DELAY = 1
RECONNECT_MAX_DELAY = 60

# ---------------------------------------------------------------------------
# Database engine (sync, utilise dans le thread MQTT)
# ---------------------------------------------------------------------------
engine = create_engine(DATABASE_URL, pool_pre_ping=True, pool_size=5, max_overflow=10)

# ---------------------------------------------------------------------------
# Seuils OMS pour eau potable (mining context)
# ---------------------------------------------------------------------------
OMS_THRESHOLDS: dict[str, dict] = {
    "mercury": {"max": 1.0, "unit": "ug/L", "severity": "CRITICAL"},
    "turbidity": {"max": 500.0, "unit": "NTU", "severity": "HIGH"},
    "ph": {"min": 6.0, "max": 9.0, "unit": "pH", "severity": "MEDIUM"},
    "dissolved_oxygen": {"min": 4.0, "unit": "mg/L", "severity": "HIGH"},
}

# Topics MQTT a souscrire
TOPICS = [
    "aquaguard/+/turbidity",
    "aquaguard/+/mercury",
    "aquaguard/+/ph",
    "aquaguard/+/dissolved_oxygen",
    "aquaguard/+/conductivity",
    "aquaguard/+/temperature",
    "aquaguard/+/gps",
]


# ---------------------------------------------------------------------------
# Persistence TimescaleDB
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
    """Inserer une lecture capteur dans la hypertable sensor_readings."""
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


# ---------------------------------------------------------------------------
# Verification seuils + alerte HTTP
# ---------------------------------------------------------------------------

def _check_thresholds(
    sensor_id: str,
    parameter: str,
    value: float,
    unit: str,
    timestamp: str,
    lat: float | None,
    lon: float | None,
) -> None:
    """
    Evaluer les seuils OMS et envoyer une alerte HTTP a alertflow-svc si depasse.
    """
    threshold = OMS_THRESHOLDS.get(parameter)
    if threshold is None:
        return

    breached = False
    detail = ""

    if "max" in threshold and value > threshold["max"]:
        breached = True
        detail = f"{parameter} = {value} {unit} depasse le seuil max {threshold['max']}"
    if "min" in threshold and value < threshold["min"]:
        breached = True
        detail = f"{parameter} = {value} {unit} sous le seuil min {threshold['min']}"

    if not breached:
        return

    log.warning(
        "seuil_depasse",
        sensor_id=sensor_id,
        parameter=parameter,
        value=value,
        detail=detail,
    )

    # Envoyer l'alerte a alertflow-svc via HTTP
    try:
        alert_payload = {
            "alert_type": "WATER_CONTAMINATION",
            "severity": threshold["severity"],
            "title": f"Alerte capteur {sensor_id}: {parameter}",
            "message": detail,
            "sensor_id": sensor_id,
            "metadata": {
                "sensor_id": sensor_id,
                "parameter": parameter,
                "value": value,
                "unit": unit,
                "threshold": threshold,
                "lat": lat,
                "lon": lon,
                "timestamp": timestamp,
            },
        }
        resp = httpx.post(
            f"{ALERTFLOW_URL}/alerts/test-fire",
            json=alert_payload,
            timeout=5.0,
        )
        if resp.status_code in (200, 201):
            log.info("alerte_envoyee", sensor_id=sensor_id, parameter=parameter)
        else:
            log.warning("alerte_echec", status=resp.status_code, body=resp.text[:200])
    except Exception as exc:
        log.error("alerte_http_erreur", error=str(exc))


# ---------------------------------------------------------------------------
# Callbacks MQTT (paho v2 API)
# ---------------------------------------------------------------------------

def on_connect(client: mqtt.Client, userdata, flags, reason_code, properties=None):
    """Souscription aux topics a chaque (re)connexion."""
    if reason_code == 0:
        log.info("mqtt.connecte", broker=MQTT_BROKER, port=MQTT_BROKER_PORT)
        for topic in TOPICS:
            client.subscribe(topic, qos=1)
            log.info("mqtt.souscrit", topic=topic)
    else:
        log.error("mqtt.connexion_echouee", reason_code=reason_code)


def on_message(client: mqtt.Client, userdata, message: mqtt.MQTTMessage):
    """Traitement de chaque message MQTT recu."""
    try:
        parts = message.topic.split("/")
        if len(parts) != 3:
            log.warning("mqtt.topic_inattendu", topic=message.topic)
            return

        _, sensor_id, parameter = parts
        payload = json.loads(message.payload.decode("utf-8"))

        # Ignorer les messages GPS (coordonnees uniquement)
        if parameter == "gps":
            return

        value = float(payload["value"])
        unit = str(payload.get("unit", ""))
        timestamp = payload.get("timestamp", datetime.now(timezone.utc).isoformat())
        battery = payload.get("battery")
        lat = payload.get("lat")
        lon = payload.get("lon")

        log.info(
            "mqtt.lecture_recue",
            sensor_id=sensor_id,
            parameter=parameter,
            value=value,
        )

        # Persister dans TimescaleDB
        _persist_reading(sensor_id, parameter, value, unit, timestamp, battery, lat, lon)

        # Verifier les seuils OMS
        _check_thresholds(sensor_id, parameter, value, unit, timestamp, lat, lon)

    except (json.JSONDecodeError, KeyError, ValueError) as exc:
        log.error("mqtt.erreur_parsing", topic=message.topic, error=str(exc))


def on_disconnect(client: mqtt.Client, userdata, flags, reason_code, properties=None):
    """Gestion de la deconnexion avec backoff."""
    log.warning("mqtt.deconnecte", reason_code=reason_code)


# ---------------------------------------------------------------------------
# Point d'entree (thread daemon depuis main.py)
# ---------------------------------------------------------------------------

def start_mqtt_subscriber() -> None:
    """Creer un client MQTT avec reconnexion automatique et boucle infinie."""
    client = mqtt.Client(
        callback_api_version=mqtt.CallbackAPIVersion.VERSION2,
        client_id="aquaguard-ingestor",
        protocol=mqtt.MQTTv5,
    )
    client.on_connect = on_connect
    client.on_message = on_message
    client.on_disconnect = on_disconnect

    # Reconnexion automatique avec backoff exponentiel
    client.reconnect_delay_set(
        min_delay=RECONNECT_MIN_DELAY,
        max_delay=RECONNECT_MAX_DELAY,
    )

    delay = RECONNECT_MIN_DELAY
    while True:
        try:
            log.info("mqtt.connexion_en_cours", broker=MQTT_BROKER, port=MQTT_BROKER_PORT)
            client.connect(MQTT_BROKER, MQTT_BROKER_PORT, keepalive=60)
            client.loop_forever()
        except Exception as exc:
            log.error("mqtt.erreur_connexion", error=str(exc), retry_in=delay)
            time.sleep(delay)
            delay = min(delay * 2, RECONNECT_MAX_DELAY)
