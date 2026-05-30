"""
Importa población de España por provincia en la tabla `census_sections` de Supabase.

Fuente geometrías: GeoJSON de provincias (codeforamerica/click_that_hood - GitHub, accesible)
Fuente población: INE Padrón Municipal 2023 (datos públicos, hardcodeados aquí)

Uso:
  SUPABASE_URL=https://... SUPABASE_KEY=... python3 backend/scripts/import_census.py
"""

import os
import time
import json
import requests
from supabase import create_client

SUPABASE_URL = os.environ.get("SUPABASE_URL") or os.environ.get("DB_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY") or os.environ.get("DB_SERVICE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise RuntimeError("Faltan variables de entorno SUPABASE_URL y SUPABASE_KEY (o DB_URL y DB_SERVICE_KEY)")

# GeoJSON de 52 provincias de España - accesible desde GitHub
GEOJSON_URL = "https://raw.githubusercontent.com/codeforamerica/click_that_hood/master/public/data/spain-provinces.geojson"

# INE Padrón Municipal 2023 - población por provincia
# Fuente: https://www.ine.es/jaxiT3/Datos.htm?t=2852 (Padrón 2023, publicado 2024)
PROVINCE_POPULATION = {
    "01": 334932,   # Araba/Álava
    "02": 387198,   # Albacete
    "03": 1929731,  # Alicante/Alacant
    "04": 756751,   # Almería
    "05": 159684,   # Ávila
    "06": 686023,   # Badajoz
    "07": 1210047,  # Illes Balears
    "08": 5749783,  # Barcelona
    "09": 360449,   # Burgos
    "10": 393604,   # Cáceres
    "11": 1244464,  # Cádiz
    "12": 593647,   # Castellón/Castelló
    "13": 488374,   # Ciudad Real
    "14": 790901,   # Córdoba
    "15": 1134679,  # A Coruña
    "16": 195316,   # Cuenca
    "17": 787826,   # Girona
    "18": 929799,   # Granada
    "19": 269062,   # Guadalajara
    "20": 726798,   # Gipuzkoa
    "21": 531879,   # Huelva
    "22": 224429,   # Huesca
    "23": 633603,   # Jaén
    "24": 452696,   # León
    "25": 448963,   # Lleida
    "26": 319914,   # La Rioja
    "27": 328175,   # Lugo
    "28": 6751251,  # Madrid
    "29": 1710539,  # Málaga
    "30": 1523707,  # Murcia
    "31": 661537,   # Navarra/Nafarroa
    "32": 309519,   # Ourense
    "33": 1022760,  # Asturias
    "34": 158521,   # Palencia
    "35": 1125788,  # Las Palmas
    "36": 961196,   # Pontevedra
    "37": 328148,   # Salamanca
    "38": 1042128,  # Santa Cruz de Tenerife
    "39": 583861,   # Cantabria
    "40": 153714,   # Segovia
    "41": 1969716,  # Sevilla
    "42": 90908,    # Soria
    "43": 831484,   # Tarragona
    "44": 141461,   # Teruel
    "45": 730918,   # Toledo
    "46": 2601225,  # Valencia/València
    "47": 524213,   # Valladolid
    "48": 1155360,  # Bizkaia
    "49": 172251,   # Zamora
    "50": 977513,   # Zaragoza
    "51": 83517,    # Ceuta
    "52": 83693,    # Melilla
}


def fetch_geojson():
    print("Descargando GeoJSON de provincias de España (GitHub)...")
    resp = requests.get(GEOJSON_URL, timeout=30)
    resp.raise_for_status()
    data = resp.json()
    features = data["features"]
    print(f"  → {len(features)} provincias recibidas")
    return features


def build_rows(features):
    rows = []
    missing = []

    for feat in features:
        props = feat.get("properties", {})
        geom = feat.get("geometry")

        # cod_prov in this GeoJSON can be "1", "02", etc — normalize to 2 digits
        cod_raw = str(props.get("cod_prov", "")).strip()
        cod = cod_raw.zfill(2)

        population = PROVINCE_POPULATION.get(cod)
        if population is None:
            missing.append(cod_raw)
            continue

        # Calculate approximate area in km²
        # WGS84 degrees → rough km² using centroid latitude
        coords = []
        g_type = geom["type"]
        if g_type == "Polygon":
            coords = geom["coordinates"][0]
        elif g_type == "MultiPolygon":
            for poly in geom["coordinates"]:
                coords.extend(poly[0])

        lats = [c[1] for c in coords if len(c) >= 2]
        lngs = [c[0] for c in coords if len(c) >= 2]
        if not lats:
            continue

        # Approximate bounding box area (rough, PostGIS will compute exact)
        lat_range = max(lats) - min(lats)
        lng_range = max(lngs) - min(lngs)
        avg_lat = sum(lats) / len(lats)
        import math
        km_per_lat = 111.32
        km_per_lng = 111.32 * math.cos(math.radians(avg_lat))
        area_km2 = round(lat_range * km_per_lat * lng_range * km_per_lng, 2)

        rows.append({
            "cusec": f"prov_{cod}",
            "municipality": props.get("name", ""),
            "municipality_code": None,
            "province": props.get("name", ""),
            "province_code": cod,
            "population": population,
            "area_km2": max(area_km2, 1.0),
            "geometry": json.dumps(geom),  # GeoJSON string → PostGIS via ST_GeomFromGeoJSON
        })

    if missing:
        print(f"  AVISO: sin población para cod_prov: {missing}")

    return rows


def insert_rows(rows):
    client = create_client(SUPABASE_URL, SUPABASE_KEY)

    # Supabase REST API doesn't accept raw GeoJSON strings as geometry.
    # We need to use the SQL/RPC approach to convert geometry.
    # Strategy: upsert without geometry first, then update geometry via RPC.

    # Actually, Supabase supports PostGIS via the REST API when the column
    # is geometry type - we pass WKT or GeoJSON as text and use a DB trigger,
    # OR we call a custom RPC. Simplest: pass geometry as WKT via RPC.

    batch_size = 10
    inserted = 0

    for i in range(0, len(rows), batch_size):
        batch = rows[i: i + batch_size]

        # Use RPC to insert with geometry conversion
        for row in batch:
            geom_json = row.pop("geometry")
            try:
                client.rpc("upsert_census_section", {
                    "p_cusec": row["cusec"],
                    "p_municipality": row["municipality"],
                    "p_municipality_code": row["municipality_code"],
                    "p_province": row["province"],
                    "p_province_code": row["province_code"],
                    "p_population": row["population"],
                    "p_area_km2": row["area_km2"],
                    "p_geometry_json": geom_json,
                }).execute()
                inserted += 1
            except Exception as e:
                print(f"  Error en {row['cusec']}: {e}")

        pct = round(inserted / len(rows) * 100)
        print(f"  {inserted}/{len(rows)} provincias insertadas ({pct}%)")
        time.sleep(0.1)

    return inserted


def main():
    print("=" * 50)
    print("ETL: Población provincias España → Supabase")
    print(f"Total esperado: {sum(PROVINCE_POPULATION.values()):,} habitantes")
    print("=" * 50)

    features = fetch_geojson()
    rows = build_rows(features)
    print(f"\n{len(rows)} provincias listas para insertar")

    inserted = insert_rows(rows)
    print(f"\n✅ Completado: {inserted} provincias cargadas en Supabase")
    print(f"   Población total: {sum(PROVINCE_POPULATION.values()):,} habitantes")


if __name__ == "__main__":
    main()
