"""
Importa secciones censales del INE en la tabla `census_sections` de Supabase.

Fuentes:
- Geometrías: CNIG shapefile de secciones censales
- Población: INE Padrón municipal por sección censal (CSV)

Uso: python backend/scripts/import_census.py
"""

import os
import io
import time
import zipfile
import tempfile
import requests
import pandas as pd
import geopandas as gpd
from supabase import create_client
from dotenv import load_dotenv

load_dotenv("backend/.env")

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_KEY"]

# URL del shapefile de secciones censales (CNIG, última edición disponible)
SHAPEFILE_URL = "https://www.cnig.es/getfile?fn=lineas_limite_municipio_etrs89.zip"

# INE: padrón por sección censal (descarga directa CSV)
# Tabla 2879 - Población por sección censal, municipio y sexo (último año disponible)
INE_PADRON_URL = "https://www.ine.es/jaxi/files/tpx/es/csv_bdsc/49562.csv"


def download_shapefile() -> gpd.GeoDataFrame:
    """Descarga y lee el shapefile de secciones censales del CNIG."""
    print("Descargando shapefile de secciones censales (CNIG)...")

    # Intentamos primero con la URL del CNIG
    # Si falla, usamos una URL alternativa de datos abiertos
    urls_to_try = [
        "https://www.cnig.es/getfile?fn=secciones_censales_etrs89.zip",
        "https://datos.gob.es/es/catalogo/e00125901-spaignllm1m-download.zip",
    ]

    for url in urls_to_try:
        try:
            resp = requests.get(url, timeout=120, stream=True)
            if resp.status_code == 200:
                with tempfile.TemporaryDirectory() as tmp:
                    zip_path = os.path.join(tmp, "sections.zip")
                    with open(zip_path, "wb") as f:
                        for chunk in resp.iter_content(chunk_size=8192):
                            f.write(chunk)

                    with zipfile.ZipFile(zip_path) as z:
                        z.extractall(tmp)

                    shp_files = [f for f in os.listdir(tmp) if f.endswith(".shp")]
                    if shp_files:
                        gdf = gpd.read_file(os.path.join(tmp, shp_files[0]))
                        gdf = gdf.to_crs("EPSG:4326")
                        print(f"  → {len(gdf)} secciones censales leídas")
                        return gdf
        except Exception as e:
            print(f"  URL fallida: {url} ({e})")

    raise RuntimeError("No se pudo descargar el shapefile de secciones censales")


def download_population() -> pd.DataFrame:
    """Descarga el CSV de población por sección censal del INE."""
    print("Descargando datos de población del INE...")
    resp = requests.get(INE_PADRON_URL, timeout=60)

    if resp.status_code != 200:
        print("  AVISO: No se pudo descargar el CSV del INE. Se usará solo geometría.")
        return pd.DataFrame()

    # El CSV del INE tiene encoding latin-1 y separador ;
    df = pd.read_csv(
        io.StringIO(resp.content.decode("latin-1")),
        sep=";",
        dtype=str,
    )
    print(f"  → {len(df)} filas de padrón leídas")
    return df


def build_rows(gdf: gpd.GeoDataFrame, pop_df: pd.DataFrame) -> list[dict]:
    """Combina geometrías y población en filas para Supabase."""
    rows = []

    # Detectar columna CUSEC en el shapefile
    cusec_col = next(
        (c for c in gdf.columns if "CUSEC" in c.upper() or "SECC" in c.upper()),
        None,
    )
    if not cusec_col:
        raise ValueError(f"No se encontró columna CUSEC en shapefile. Columnas: {list(gdf.columns)}")

    # Preparar lookup de población por CUSEC
    pop_lookup = {}
    if not pop_df.empty:
        cusec_pop_col = next(
            (c for c in pop_df.columns if "CUSEC" in c.upper() or "SECC" in c.upper()),
            None,
        )
        pop_col = next(
            (c for c in pop_df.columns if "TOTAL" in c.upper() or "POB" in c.upper()),
            None,
        )
        if cusec_pop_col and pop_col:
            for _, row in pop_df.iterrows():
                try:
                    pop_lookup[str(row[cusec_pop_col]).strip()] = int(
                        str(row[pop_col]).replace(".", "").replace(",", "").strip() or 0
                    )
                except (ValueError, TypeError):
                    pass

    muni_col = next((c for c in gdf.columns if "NOM" in c.upper() and "MUN" in c.upper()), None)
    prov_col = next((c for c in gdf.columns if "NOM" in c.upper() and "PROV" in c.upper()), None)
    muni_code_col = next((c for c in gdf.columns if "CMUN" in c.upper()), None)
    prov_code_col = next((c for c in gdf.columns if "CPRO" in c.upper()), None)

    for _, row in gdf.iterrows():
        cusec = str(row[cusec_col]).strip()
        geom = row.geometry

        if geom is None or geom.is_empty:
            continue

        area_km2 = geom.area * (111.32**2)  # grados → km² (aproximación)

        rows.append({
            "cusec": cusec,
            "municipality": str(row[muni_col]) if muni_col else "",
            "municipality_code": str(row[muni_code_col]) if muni_code_col else None,
            "province": str(row[prov_col]) if prov_col else "",
            "province_code": str(row[prov_code_col]) if prov_code_col else None,
            "population": pop_lookup.get(cusec, 0),
            "area_km2": round(area_km2, 4),
            "geometry": geom.wkt,
        })

    return rows


def insert_rows(rows: list[dict]):
    client = create_client(SUPABASE_URL, SUPABASE_KEY)
    batch_size = 200
    inserted = 0

    for i in range(0, len(rows), batch_size):
        batch = rows[i : i + batch_size]
        client.table("census_sections").upsert(
            batch, on_conflict="cusec", ignore_duplicates=False
        ).execute()
        inserted += len(batch)
        pct = round(inserted / len(rows) * 100)
        print(f"  {inserted}/{len(rows)} secciones insertadas ({pct}%)")
        time.sleep(0.3)

    return inserted


def main():
    print("=" * 50)
    print("ETL: Secciones censales INE → Supabase")
    print("=" * 50)

    gdf = download_shapefile()
    pop_df = download_population()
    rows = build_rows(gdf, pop_df)

    print(f"\nPreparando {len(rows)} secciones para insertar...")
    inserted = insert_rows(rows)
    print(f"\n✅ Completado: {inserted} secciones censales cargadas en Supabase")


if __name__ == "__main__":
    main()
