#!/usr/bin/env python3
"""
Generateur de donnees capteurs AquaGuard pour seed (7 jours, intervalle 5min).

Genere des lectures simulees pour 3 capteurs (Comoe, Bandama, Sassandra)
avec 4 parametres chacun (turbidity, mercury, ph, dissolved_oxygen).
Insere directement dans la hypertable sensor_readings via SQL.

Usage:
    python scripts/seed-sensor-data.py
    # ou avec une URL de base de donnees personnalisee:
    DATABASE_URL=postgresql://... python scripts/seed-sensor-data.py
"""

from __future__ import annotations

import os
import random
import sys
from datetime import datetime, timedelta, timezone

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://geominer:geominer2026@localhost:5432/geominerdb",
)

# Capteurs AquaGuard avec coordonnees reelles en Cote d'Ivoire
SENSORS = [
    {
        "sensor_id": "COMOE-01",
        "lat": 5.3364,
        "lon": -3.4948,
        "name": "Riviere Comoe - Zone miniere Aboisso",
    },
    {
        "sensor_id": "BANDAMA-01",
        "lat": 6.5833,
        "lon": -5.2833,
        "name": "Fleuve Bandama - Zone Bouafle",
    },
    {
        "sensor_id": "SASSANDRA-01",
        "lat": 6.1333,
        "lon": -6.3500,
        "name": "Fleuve Sassandra - Zone Soubre",
    },
]

# Parametres de mesure avec plages normales et anomalies
PARAMETERS = {
    "turbidity": {
        "unit": "NTU",
        "normal_min": 80.0,
        "normal_max": 200.0,
        "anomaly_min": 500.0,
        "anomaly_max": 900.0,
    },
    "mercury": {
        "unit": "ug/L",
        "normal_min": 0.05,
        "normal_max": 0.4,
        "anomaly_min": 1.5,
        "anomaly_max": 3.5,
    },
    "ph": {
        "unit": "pH",
        "normal_min": 6.8,
        "normal_max": 7.8,
        "anomaly_min": 4.5,
        "anomaly_max": 5.5,
    },
    "dissolved_oxygen": {
        "unit": "mg/L",
        "normal_min": 6.0,
        "normal_max": 9.0,
        "anomaly_min": 2.0,
        "anomaly_max": 3.5,
    },
}

# Configuration temporelle
DAYS = 7
INTERVAL_MINUTES = 5
ANOMALY_PROBABILITY = 0.03  # 3% de chance d'anomalie


def generate_readings() -> list[tuple]:
    """Generer toutes les lectures pour les 7 derniers jours."""
    readings = []
    now = datetime.now(timezone.utc)
    start = now - timedelta(days=DAYS)

    total_intervals = (DAYS * 24 * 60) // INTERVAL_MINUTES
    print(f"Generation de {total_intervals} intervalles x {len(SENSORS)} capteurs x {len(PARAMETERS)} parametres...")

    for sensor in SENSORS:
        current_time = start
        battery = 95.0 + random.uniform(-5, 5)

        for _ in range(total_intervals):
            is_anomaly = random.random() < ANOMALY_PROBABILITY

            for param_name, param_config in PARAMETERS.items():
                if is_anomaly:
                    value = random.uniform(param_config["anomaly_min"], param_config["anomaly_max"])
                else:
                    value = random.uniform(param_config["normal_min"], param_config["normal_max"])

                # Ajouter un peu de bruit
                value = round(value + random.gauss(0, value * 0.02), 4)

                readings.append((
                    sensor["sensor_id"],
                    param_name,
                    value,
                    param_config["unit"],
                    current_time.isoformat(),
                    round(battery, 1),
                    sensor["lat"] + random.uniform(-0.001, 0.001),
                    sensor["lon"] + random.uniform(-0.001, 0.001),
                ))

            # Degradation batterie legere
            battery -= random.uniform(0, 0.02)
            battery = max(battery, 10.0)

            current_time += timedelta(minutes=INTERVAL_MINUTES)

    return readings


def insert_readings(readings: list[tuple]) -> None:
    """Inserer les lectures dans la base de donnees."""
    try:
        import psycopg2
    except ImportError:
        print("ERREUR: psycopg2 non installe. Installez-le avec: pip install psycopg2-binary")
        sys.exit(1)

    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()

    print(f"Insertion de {len(readings)} lectures dans sensor_readings...")

    # Utiliser COPY pour les performances
    batch_size = 1000
    inserted = 0

    for i in range(0, len(readings), batch_size):
        batch = readings[i:i + batch_size]
        values_list = []
        for r in batch:
            sensor_id, parameter, value, unit, timestamp, battery, lat, lon = r
            values_list.append(
                cur.mogrify(
                    "(%s, %s, %s, %s, %s, %s, %s, %s)",
                    (sensor_id, parameter, value, unit, timestamp, battery, lat, lon),
                ).decode("utf-8")
            )

        query = (
            "INSERT INTO sensor_readings "
            "(sensor_id, parameter, value, unit, timestamp, battery, lat, lon) "
            "VALUES " + ",".join(values_list)
        )
        cur.execute(query)
        inserted += len(batch)

        if inserted % 10000 == 0:
            print(f"  {inserted}/{len(readings)} lectures inserees...")

    conn.commit()
    cur.close()
    conn.close()

    print(f"Termine ! {inserted} lectures inserees avec succes.")


def print_summary(readings: list[tuple]) -> None:
    """Afficher un resume des donnees generees."""
    print("\n--- Resume des donnees generees ---")
    print(f"Periode : {DAYS} jours, intervalle {INTERVAL_MINUTES} min")
    print(f"Capteurs : {len(SENSORS)}")
    print(f"Parametres : {len(PARAMETERS)}")
    print(f"Total lectures : {len(readings)}")
    print(f"Probabilite anomalie : {ANOMALY_PROBABILITY * 100}%")

    # Compter les anomalies par capteur
    for sensor in SENSORS:
        count = sum(1 for r in readings if r[0] == sensor["sensor_id"])
        print(f"  {sensor['sensor_id']} ({sensor['name']}): {count} lectures")


def main():
    """Point d'entree principal."""
    print("=== Seed donnees capteurs AquaGuard ===\n")

    readings = generate_readings()
    print_summary(readings)

    print(f"\nConnexion a la base de donnees: {DATABASE_URL.split('@')[1] if '@' in DATABASE_URL else DATABASE_URL}")
    insert_readings(readings)


if __name__ == "__main__":
    main()
