#!/usr/bin/env python3
"""
AquaGuard IoT Sensor Simulator.

Simulates three water-quality sensors in the Bagoue region, publishing
telemetry over MQTT at a configurable interval.  Each sensor publishes
five parameters: turbidity, pH, mercury, dissolved oxygen, and conductivity.

10 % of readings are deliberate anomalies that exceed OMS thresholds so the
alerting pipeline can be exercised.

Usage:
    python simulate.py --broker localhost --port 1883 --interval 30
"""

from __future__ import annotations

import argparse
import json
import random
import sys
import time
from datetime import datetime, timezone

import paho.mqtt.client as mqtt

# ---------------------------------------------------------------------------
# Sensor definitions
# ---------------------------------------------------------------------------

SENSORS = [
    {"id": "AQ-BAG-001", "lat": 9.72, "lon": -6.42},
    {"id": "AQ-BAG-002", "lat": 9.75, "lon": -6.45},
    {"id": "AQ-BAG-003", "lat": 9.78, "lon": -6.48},
]

# Parameter configs: (normal_min, normal_max, anomaly_min, anomaly_max, unit)
PARAMETERS: dict[str, dict] = {
    "turbidity": {
        "normal": (0.5, 4.0),
        "anomaly": (6.0, 25.0),
        "unit": "NTU",
    },
    "ph": {
        "normal": (6.8, 8.2),
        "anomaly_low": (4.0, 6.0),
        "anomaly_high": (9.0, 12.0),
        "unit": "pH",
    },
    "mercury": {
        "normal": (0.0001, 0.0008),
        "anomaly": (0.002, 0.01),
        "unit": "mg/L",
    },
    "dissolved_oxygen": {
        "normal": (6.0, 9.0),
        "anomaly": (1.0, 4.5),
        "unit": "mg/L",
    },
    "conductivity": {
        "normal": (200.0, 800.0),
        "anomaly": (1200.0, 3000.0),
        "unit": "uS/cm",
    },
}

ANOMALY_PROBABILITY = 0.10  # 10 %


# ---------------------------------------------------------------------------
# Value generation
# ---------------------------------------------------------------------------

def _generate_value(param: str) -> tuple[float, str]:
    """Return (value, unit) for *param*, occasionally producing an anomaly."""
    cfg = PARAMETERS[param]
    is_anomaly = random.random() < ANOMALY_PROBABILITY

    if is_anomaly:
        if param == "ph":
            # pH can be anomalous on either side
            if random.random() < 0.5:
                value = random.uniform(*cfg["anomaly_low"])
            else:
                value = random.uniform(*cfg["anomaly_high"])
        else:
            value = random.uniform(*cfg["anomaly"])
    else:
        value = random.uniform(*cfg["normal"])

    # Round to sensible precision
    if param == "mercury":
        value = round(value, 6)
    elif param in ("ph", "dissolved_oxygen"):
        value = round(value, 2)
    elif param == "turbidity":
        value = round(value, 2)
    else:
        value = round(value, 1)

    return value, cfg["unit"]


def _build_payload(sensor: dict, param: str) -> dict:
    """Build the JSON telemetry payload for one reading."""
    value, unit = _generate_value(param)
    return {
        "value": value,
        "unit": unit,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "battery": round(random.uniform(3.0, 4.2), 2),
        "lat": sensor["lat"] + random.uniform(-0.005, 0.005),
        "lon": sensor["lon"] + random.uniform(-0.005, 0.005),
    }


# ---------------------------------------------------------------------------
# MQTT helpers
# ---------------------------------------------------------------------------

def on_connect(client: mqtt.Client, userdata, flags, reason_code, properties=None):
    if reason_code == 0:
        print(f"[MQTT] Connected to broker")
    else:
        print(f"[MQTT] Connection failed: {reason_code}", file=sys.stderr)


def on_disconnect(client: mqtt.Client, userdata, flags, reason_code, properties=None):
    print(f"[MQTT] Disconnected (rc={reason_code})")


def create_client(broker: str, port: int) -> mqtt.Client:
    """Create and connect a paho-mqtt v2 client."""
    client = mqtt.Client(
        callback_api_version=mqtt.CallbackAPIVersion.VERSION2,
        client_id=f"aquaguard-simulator-{random.randint(1000, 9999)}",
        protocol=mqtt.MQTTv5,
    )
    client.on_connect = on_connect
    client.on_disconnect = on_disconnect
    client.connect(broker, port, keepalive=60)
    client.loop_start()
    return client


# ---------------------------------------------------------------------------
# Main loop
# ---------------------------------------------------------------------------

def run(broker: str, port: int, interval: int) -> None:
    """Continuously publish sensor readings."""
    client = create_client(broker, port)

    print(f"[SIM] Publishing every {interval}s for {len(SENSORS)} sensors")
    print(f"[SIM] Anomaly probability: {ANOMALY_PROBABILITY * 100:.0f}%")
    print(f"[SIM] Parameters: {', '.join(PARAMETERS.keys())}")

    try:
        while True:
            for sensor in SENSORS:
                for param in PARAMETERS:
                    topic = f"aquaguard/{sensor['id']}/{param}"
                    payload = _build_payload(sensor, param)
                    client.publish(topic, json.dumps(payload), qos=1)
                    print(
                        f"[SIM] {sensor['id']}/{param} = {payload['value']} {payload['unit']}"
                    )
            print(f"[SIM] --- cycle complete, sleeping {interval}s ---")
            time.sleep(interval)
    except KeyboardInterrupt:
        print("\n[SIM] Shutting down...")
    finally:
        client.loop_stop()
        client.disconnect()


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        description="AquaGuard IoT sensor simulator",
    )
    parser.add_argument(
        "--broker",
        default="localhost",
        help="MQTT broker hostname (default: localhost)",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=1883,
        help="MQTT broker port (default: 1883)",
    )
    parser.add_argument(
        "--interval",
        type=int,
        default=30,
        help="Publish interval in seconds (default: 30)",
    )
    args = parser.parse_args()
    run(args.broker, args.port, args.interval)


if __name__ == "__main__":
    main()
