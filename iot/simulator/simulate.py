#!/usr/bin/env python3
"""
AquaGuard IoT Sensor Simulator - Ge O'Miner.

Simulateur MQTT complet pour capteurs de qualite d'eau.
Publie des donnees de telemetrie sur les topics aquaguard/{sensor_id}/{parameter}.

Modes:
  - Normal : valeurs dans les plages normales
  - Anomaly (--anomaly) : pics de mercure et turbidite depassant les seuils OMS

Usage:
    python simulate.py --sensor-id COMOE-01 --duration 60
    python simulate.py --anomaly --duration 10
"""

from __future__ import annotations

import argparse
import json
import random
import sys
import time
from datetime import datetime, timezone

import paho.mqtt.client as mqtt

# Tenter d'importer rich pour l'affichage colore
try:
    from rich.console import Console
    from rich.live import Live
    from rich.table import Table
    from rich.text import Text
    HAS_RICH = True
except ImportError:
    HAS_RICH = False

# ---------------------------------------------------------------------------
# Configuration des capteurs
# ---------------------------------------------------------------------------

SENSORS = {
    "COMOE-01": {"lat": 9.4520, "lon": -5.9830, "riviere": "Comoe"},
    "BANDAMA-01": {"lat": 9.3100, "lon": -5.8450, "riviere": "Bandama"},
    "SASSANDRA-01": {"lat": 9.1250, "lon": -6.1200, "riviere": "Sassandra"},
}

# Plages par parametre : (normal_min, normal_max, unit)
PARAMS_NORMAL = {
    "turbidity":        {"min": 120.0, "max": 180.0, "unit": "NTU"},
    "mercury":          {"min": 0.1,   "max": 0.3,   "unit": "ug/L"},
    "ph":               {"min": 7.0,   "max": 7.5,   "unit": "pH"},
    "temp":             {"min": 25.0,  "max": 28.0,   "unit": "C"},
    "dissolved_oxygen": {"min": 5.5,   "max": 8.0,   "unit": "mg/L"},
}

# Plages en mode anomalie
PARAMS_ANOMALY = {
    "turbidity":        {"min": 600.0, "max": 900.0, "unit": "NTU"},
    "mercury":          {"min": 1.5,   "max": 3.5,   "unit": "ug/L"},
    "ph":               {"min": 4.5,   "max": 5.5,   "unit": "pH"},
    "temp":             {"min": 30.0,  "max": 35.0,   "unit": "C"},
    "dissolved_oxygen": {"min": 1.5,   "max": 3.0,   "unit": "mg/L"},
}

# Seuils OMS pour detection d'anomalie
OMS_THRESHOLDS = {
    "mercury": 1.0,      # ug/L
    "turbidity": 500.0,  # NTU
    "ph_low": 6.5,
    "ph_high": 8.5,
}


# ---------------------------------------------------------------------------
# Generation de valeurs
# ---------------------------------------------------------------------------

def generate_value(param: str, anomaly_mode: bool) -> tuple[float, str, bool]:
    """Generer une valeur pour un parametre. Retourne (valeur, unite, is_anomaly)."""
    cfg_normal = PARAMS_NORMAL[param]
    cfg_anomaly = PARAMS_ANOMALY[param]

    if anomaly_mode:
        value = random.uniform(cfg_anomaly["min"], cfg_anomaly["max"])
        is_anomaly = True
    else:
        value = random.uniform(cfg_normal["min"], cfg_normal["max"])
        is_anomaly = False

    # Precision selon le parametre
    if param == "mercury":
        value = round(value, 4)
    elif param in ("ph", "dissolved_oxygen", "temp"):
        value = round(value, 2)
    else:
        value = round(value, 1)

    return value, cfg_normal["unit"], is_anomaly


def generate_battery() -> float:
    """Generer un niveau de batterie entre 85 et 95%."""
    return round(random.uniform(85.0, 95.0), 1)


# ---------------------------------------------------------------------------
# MQTT
# ---------------------------------------------------------------------------

def on_connect(client: mqtt.Client, userdata, flags, reason_code, properties=None):
    status = "connecte" if reason_code == 0 else f"echec ({reason_code})"
    if HAS_RICH:
        console = Console()
        console.print(f"[bold green][MQTT][/] {status}")
    else:
        print(f"[MQTT] {status}")


def on_disconnect(client: mqtt.Client, userdata, flags, reason_code, properties=None):
    if HAS_RICH:
        Console().print(f"[bold yellow][MQTT][/] Deconnecte (rc={reason_code})")
    else:
        print(f"[MQTT] Deconnecte (rc={reason_code})")


def create_client(host: str, port: int) -> mqtt.Client:
    """Creer et connecter un client MQTT v5."""
    client = mqtt.Client(
        callback_api_version=mqtt.CallbackAPIVersion.VERSION2,
        client_id=f"aquaguard-sim-{random.randint(1000, 9999)}",
        protocol=mqtt.MQTTv5,
    )
    client.on_connect = on_connect
    client.on_disconnect = on_disconnect
    client.connect(host, port, keepalive=60)
    client.loop_start()
    return client


# ---------------------------------------------------------------------------
# Affichage Rich (table live)
# ---------------------------------------------------------------------------

def build_table(readings: dict[str, dict], cycle: int, anomaly_mode: bool) -> Table:
    """Construire la table Rich pour affichage live."""
    mode_label = "[bold red]ANOMALIE" if anomaly_mode else "[bold green]NORMAL"
    table = Table(
        title=f"AquaGuard IoT - Cycle #{cycle} - Mode {mode_label}",
        show_header=True,
        header_style="bold cyan",
    )
    table.add_column("Capteur", style="bold")
    table.add_column("Riviere", style="dim")
    table.add_column("Turbidite", justify="right")
    table.add_column("Mercure", justify="right")
    table.add_column("pH", justify="right")
    table.add_column("Temp", justify="right")
    table.add_column("O2 dissous", justify="right")
    table.add_column("Batterie", justify="right")

    for sensor_id, data in readings.items():
        row = [sensor_id, SENSORS[sensor_id]["riviere"]]
        for param in ["turbidity", "mercury", "ph", "temp", "dissolved_oxygen"]:
            val = data.get(param, {})
            value = val.get("value", 0)
            unit = val.get("unit", "")
            is_anom = val.get("is_anomaly", False)

            text = f"{value} {unit}"
            if is_anom:
                row.append(f"[bold red]{text} ⚠[/]")
            else:
                row.append(f"[green]{text}[/]")

        battery = data.get("battery", 0)
        row.append(f"{battery}%")
        table.add_row(*row)

    return table


# ---------------------------------------------------------------------------
# Boucle principale
# ---------------------------------------------------------------------------

def run(
    sensor_id: str | None,
    host: str,
    port: int,
    duration: int,
    anomaly_mode: bool,
) -> None:
    """Publier des lectures de capteurs en boucle."""
    client = create_client(host, port)

    # Determiner les capteurs a simuler
    if sensor_id and sensor_id in SENSORS:
        active_sensors = {sensor_id: SENSORS[sensor_id]}
    elif sensor_id:
        # Capteur personnalise
        active_sensors = {sensor_id: {"lat": 9.45, "lon": -5.98, "riviere": "Custom"}}
    else:
        active_sensors = SENSORS

    interval = 2  # Publication toutes les 2 secondes
    total_cycles = duration // interval if duration > 0 else float("inf")
    cycle = 0
    msg_count = 0

    console = Console() if HAS_RICH else None

    if console:
        console.print(f"\n[bold cyan]AquaGuard IoT Simulator[/]")
        console.print(f"  Capteurs : {list(active_sensors.keys())}")
        console.print(f"  Mode     : {'[red]ANOMALIE[/]' if anomaly_mode else '[green]NORMAL[/]'}")
        console.print(f"  Duree    : {duration}s ({total_cycles} cycles)")
        console.print(f"  Broker   : {host}:{port}\n")
    else:
        print(f"\n[SIM] AquaGuard IoT Simulator")
        print(f"[SIM] Capteurs: {list(active_sensors.keys())}")
        print(f"[SIM] Mode: {'ANOMALIE' if anomaly_mode else 'NORMAL'}")
        print(f"[SIM] Duree: {duration}s\n")

    try:
        if HAS_RICH:
            with Live(console=console, refresh_per_second=1) as live:
                while cycle < total_cycles:
                    cycle += 1
                    readings = {}
                    battery = generate_battery()

                    for sid, sensor_info in active_sensors.items():
                        readings[sid] = {"battery": battery}

                        for param in PARAMS_NORMAL:
                            value, unit, is_anomaly = generate_value(param, anomaly_mode)
                            payload = {
                                "sensor_id": sid,
                                "value": value,
                                "unit": unit,
                                "is_anomaly": is_anomaly,
                                "timestamp": datetime.now(timezone.utc).isoformat(),
                                "battery_pct": battery,
                            }

                            topic = f"aquaguard/{sid}/{param}"
                            client.publish(topic, json.dumps(payload), qos=1)
                            msg_count += 1

                            readings[sid][param] = {
                                "value": value,
                                "unit": unit,
                                "is_anomaly": is_anomaly,
                            }

                        # Publier aussi la position GPS
                        gps_payload = {
                            "sensor_id": sid,
                            "lat": sensor_info["lat"] + random.uniform(-0.001, 0.001),
                            "lon": sensor_info["lon"] + random.uniform(-0.001, 0.001),
                            "timestamp": datetime.now(timezone.utc).isoformat(),
                        }
                        client.publish(f"aquaguard/{sid}/gps", json.dumps(gps_payload), qos=1)
                        msg_count += 1

                    live.update(build_table(readings, cycle, anomaly_mode))
                    time.sleep(interval)
        else:
            # Mode sans rich
            while cycle < total_cycles:
                cycle += 1
                battery = generate_battery()

                for sid, sensor_info in active_sensors.items():
                    for param in PARAMS_NORMAL:
                        value, unit, is_anomaly = generate_value(param, anomaly_mode)
                        payload = {
                            "sensor_id": sid,
                            "value": value,
                            "unit": unit,
                            "is_anomaly": is_anomaly,
                            "timestamp": datetime.now(timezone.utc).isoformat(),
                            "battery_pct": battery,
                        }
                        topic = f"aquaguard/{sid}/{param}"
                        client.publish(topic, json.dumps(payload), qos=1)
                        msg_count += 1

                        marker = " ⚠ ANOMALIE" if is_anomaly else ""
                        print(f"[{sid}] {param}={value} {unit}{marker}")

                    # GPS
                    gps_payload = {
                        "sensor_id": sid,
                        "lat": sensor_info["lat"] + random.uniform(-0.001, 0.001),
                        "lon": sensor_info["lon"] + random.uniform(-0.001, 0.001),
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                    }
                    client.publish(f"aquaguard/{sid}/gps", json.dumps(gps_payload), qos=1)
                    msg_count += 1

                print(f"--- Cycle {cycle}/{total_cycles} ({msg_count} messages) ---")
                time.sleep(interval)

    except KeyboardInterrupt:
        pass
    finally:
        client.loop_stop()
        client.disconnect()
        summary = f"\nTermine: {msg_count} messages publies en {cycle} cycles."
        if HAS_RICH:
            Console().print(f"[bold green]{summary}[/]")
        else:
            print(summary)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        description="AquaGuard IoT - Simulateur de capteurs qualite eau",
    )
    parser.add_argument(
        "--sensor-id",
        default=None,
        help="ID du capteur a simuler (default: tous - COMOE-01, BANDAMA-01, SASSANDRA-01)",
    )
    parser.add_argument(
        "--host",
        default="localhost",
        help="Hostname du broker MQTT (default: localhost)",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=1883,
        help="Port du broker MQTT (default: 1883)",
    )
    parser.add_argument(
        "--duration",
        type=int,
        default=60,
        help="Duree de simulation en secondes (default: 60)",
    )
    parser.add_argument(
        "--anomaly",
        action="store_true",
        help="Activer le mode anomalie (mercure 1.5-3.5 ug/L, turbidite 600-900 NTU)",
    )
    args = parser.parse_args()

    run(
        sensor_id=args.sensor_id,
        host=args.host,
        port=args.port,
        duration=args.duration,
        anomaly_mode=args.anomaly,
    )


if __name__ == "__main__":
    main()
