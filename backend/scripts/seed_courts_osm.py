"""
Carga pistas de pádel de toda España desde OpenStreetMap (Overpass API)
en la tabla `courts` de Supabase.

Uso: python backend/scripts/seed_courts_osm.py
"""

import os
import time
import requests
from supabase import create_client
from dotenv import load_dotenv

load_dotenv("backend/.env")

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_KEY"]

OVERPASS_URL = "https://overpass.kumi.systems/api/interpreter"

# España completa (bbox: sur, oeste, norte, este)
SPAIN_BBOX = "27.6,-18.2,43.8,4.4"

QUERY = f"""
[out:json][timeout:120];
(
  node["sport"="padel"]({SPAIN_BBOX});
  way["sport"="padel"]({SPAIN_BBOX});
  node["leisure"="pitch"]["sport"="padel"]({SPAIN_BBOX});
  way["leisure"="pitch"]["sport"="padel"]({SPAIN_BBOX});
  node["leisure"="sports_centre"]["sport"="padel"]({SPAIN_BBOX});
  way["leisure"="sports_centre"]["sport"="padel"]({SPAIN_BBOX});
);
out center tags;
"""


def is_indoor(tags: dict) -> bool:
    return (
        tags.get("indoor") == "yes"
        or tags.get("covered") == "yes"
        or tags.get("building") in ("yes", "sports_hall", "sport")
    )


def fetch_courts():
    print("Consultando Overpass API (puede tardar 30-60 segundos)...")
    resp = requests.post(OVERPASS_URL, data={"data": QUERY}, timeout=180)
    resp.raise_for_status()
    data = resp.json()
    elements = data.get("elements", [])
    print(f"  → {len(elements)} elementos encontrados en OSM")
    return elements


def parse_courts(elements: list) -> list[dict]:
    courts = []
    for el in elements:
        tags = el.get("tags", {})
        lat = el.get("lat") or el.get("center", {}).get("lat")
        lng = el.get("lon") or el.get("center", {}).get("lon")

        if lat is None or lng is None:
            continue

        courts.append({
            "osm_id": f"{el['type']}_{el['id']}",
            "name": tags.get("name") or tags.get("operator") or None,
            "lat": lat,
            "lng": lng,
            "is_indoor": is_indoor(tags),
            "source": "osm",
            "verified": False,
        })

    return courts


def insert_courts(courts: list[dict]):
    client = create_client(SUPABASE_URL, SUPABASE_KEY)
    batch_size = 100
    inserted = 0
    skipped = 0

    for i in range(0, len(courts), batch_size):
        batch = courts[i : i + batch_size]
        resp = (
            client.table("courts")
            .upsert(batch, on_conflict="osm_id", ignore_duplicates=True)
            .execute()
        )
        count = len(batch)
        inserted += count
        print(f"  Batch {i // batch_size + 1}: {count} pistas procesadas ({inserted} total)")
        time.sleep(0.2)

    return inserted


def main():
    print("=" * 50)
    print("SEED: Pistas de pádel OSM → Supabase")
    print("=" * 50)

    elements = fetch_courts()
    courts = parse_courts(elements)

    indoor = sum(1 for c in courts if c["is_indoor"])
    outdoor = len(courts) - indoor
    print(f"\nResumen: {len(courts)} pistas ({indoor} indoor, {outdoor} outdoor)")

    inserted = insert_courts(courts)
    print(f"\n✅ Completado: {inserted} pistas cargadas en Supabase")


if __name__ == "__main__":
    main()
