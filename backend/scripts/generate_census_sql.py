"""
Genera el SQL para cargar municipios de España en Supabase.

Requisitos:
  pip install geopandas pandas shapely pyproj

Uso:
  python generate_census_sql.py \
    --shp "C:/ruta/ll_municipales_inspire_peninbal_etrs89.shp" \
    --ine "C:/ruta/INE_Poblacion_2025.csv" \
    --out "census_municipios.sql"

El archivo .sql generado se ejecuta en Supabase → SQL Editor.
"""

import sys
import argparse
import re
import unicodedata
import pandas as pd


def normalize(s):
    s = str(s).lower().strip()
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    s = re.sub(r"[^a-z0-9 ]", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--shp", required=True, help="Ruta al .shp del IGN")
    p.add_argument("--ine", required=True, help="Ruta al CSV del INE")
    p.add_argument("--out", default="census_municipios.sql", help="Archivo SQL de salida")
    p.add_argument("--simplify", type=float, default=0.001,
                   help="Tolerancia de simplificación en grados (default 0.001 ≈ 100m)")
    return p.parse_args()


def load_ine(path):
    # Skip the first title row
    df = pd.read_csv(path, skiprows=1, dtype=str)
    df = df.rename(columns=str.strip)
    df["cod"] = df["CPRO"].str.strip().str.zfill(2) + df["CMUN"].str.strip().str.zfill(3)
    df["population"] = pd.to_numeric(df["POB25"], errors="coerce").fillna(0).astype(int)
    df["name"] = df["NOMBRE"].str.strip()
    return df[["cod", "name", "population"]].set_index("cod")


def load_shp(path, simplify_tol):
    try:
        import geopandas as gpd
    except ImportError:
        print("ERROR: Instala geopandas:  pip install geopandas")
        sys.exit(1)

    gdf = gpd.read_file(path)
    print(f"  Shapefile cargado: {len(gdf)} municipios")
    print(f"  CRS original: {gdf.crs}")
    print(f"  Columnas: {list(gdf.columns)}")

    # Reproject to WGS84
    gdf = gdf.to_crs("EPSG:4326")

    # Simplify geometry to reduce SQL file size
    if simplify_tol > 0:
        gdf["geometry"] = gdf["geometry"].simplify(simplify_tol, preserve_topology=True)

    return gdf


def extract_ine_code(natcode):
    """
    NATCODE format from IGN: '34ES' + 2-digit province + 3-digit municipality
    e.g. '34ES01001' → '01001'
    """
    s = str(natcode).strip()
    # Try removing '34ES' prefix
    if s.startswith("34ES"):
        return s[4:]
    # Try last 5 digits
    if len(s) >= 5:
        return s[-5:]
    return None


def match_municipalities(gdf, ine_df):
    """Join shapefile with INE population by municipality code."""
    # Find the code column in the shapefile
    code_col = None
    for col in ["NATCODE", "CODIGOINE", "COD_INE", "CODMUN", "natcode"]:
        if col in gdf.columns:
            code_col = col
            break

    if code_col is None:
        print(f"  AVISO: No se encontró columna de código INE. Columnas disponibles: {list(gdf.columns)}")
        print("  Intentando buscar por nombre...")
        return match_by_name(gdf, ine_df)

    print(f"  Usando columna de código: {code_col}")
    gdf["ine_cod"] = gdf[code_col].apply(extract_ine_code)

    matched = gdf.merge(ine_df.reset_index(), left_on="ine_cod", right_on="cod", how="left")
    ok = matched["population"].notna().sum()
    print(f"  Match por código: {ok}/{len(gdf)} municipios")

    if ok < len(gdf) * 0.8:
        print("  Match insuficiente por código, complementando con nombre...")

    matched["population"] = matched["population"].fillna(0).astype(int)
    return matched


def match_by_name(gdf, ine_df):
    """Fallback: match by municipality name."""
    name_col = None
    for col in ["NAMEUNIT", "NOMBRE", "name", "NAME"]:
        if col in gdf.columns:
            name_col = col
            break

    if name_col is None:
        print(f"  ERROR: No se encontró columna de nombre. Columnas: {list(gdf.columns)}")
        sys.exit(1)

    ine_by_name = {normalize(row["name"]): row for _, row in ine_df.reset_index().iterrows()}

    populations = []
    names = []
    codes = []
    for _, row in gdf.iterrows():
        name = str(row[name_col])
        pop = 0
        cod = ""
        key = normalize(name)
        if key in ine_by_name:
            pop = int(ine_by_name[key]["population"])
            cod = ine_by_name[key]["cod"]
        else:
            for sep in ["/", " - ", ","]:
                part = normalize(name.split(sep)[0])
                if part in ine_by_name:
                    pop = int(ine_by_name[part]["population"])
                    cod = ine_by_name[part]["cod"]
                    break
        populations.append(pop)
        names.append(name)
        codes.append(cod)

    gdf = gdf.copy()
    gdf["population"] = populations
    gdf["name"] = names
    gdf["ine_cod"] = codes
    matched = gdf["population"].gt(0).sum()
    print(f"  Match por nombre: {matched}/{len(gdf)} municipios")
    return gdf


def escape_sql(s):
    return str(s).replace("'", "''")


def generate_sql(matched, out_path):
    from shapely.wkt import dumps as wkt_dumps

    lines = [
        "-- Generado automáticamente por generate_census_sql.py",
        "-- Municipios de España con población INE 2025 + geometría IGN",
        "",
        "-- Vaciar datos anteriores de municipios",
        "DELETE FROM census_sections WHERE cusec LIKE 'mun_%';",
        "",
    ]

    name_col = None
    for col in ["NAMEUNIT", "name", "NOMBRE", "NAME"]:
        if col in matched.columns:
            name_col = col
            break

    inserted = 0
    skipped = 0

    for _, row in matched.iterrows():
        geom = row["geometry"]
        if geom is None or geom.is_empty:
            skipped += 1
            continue

        pop = int(row.get("population", 0))
        name = escape_sql(row.get(name_col, "") if name_col else "")
        cod = str(row.get("ine_cod", "")).strip()
        cusec = f"mun_{cod}" if cod else f"mun_{inserted:05d}"

        # Calculate area in km²
        try:
            from pyproj import Geod
            geod = Geod(ellps="WGS84")
            area_m2 = abs(geod.geometry_area_perimeter(geom)[0])
            area_km2 = round(area_m2 / 1_000_000, 4)
        except Exception:
            area_km2 = 1.0

        wkt = wkt_dumps(geom, rounding_precision=6)

        lines.append(
            f"INSERT INTO census_sections (cusec, municipality, population, area_km2, geometry) "
            f"VALUES ("
            f"'{cusec}', "
            f"'{name}', "
            f"{pop}, "
            f"{area_km2}, "
            f"ST_GeomFromText('{wkt}', 4326)"
            f") ON CONFLICT (cusec) DO UPDATE SET "
            f"population = EXCLUDED.population, "
            f"area_km2 = EXCLUDED.area_km2, "
            f"geometry = EXCLUDED.geometry;"
        )
        inserted += 1

    lines.append(f"\n-- Total: {inserted} municipios insertados, {skipped} omitidos (geometría vacía)")
    lines.append(f"SELECT COUNT(*), SUM(population) FROM census_sections WHERE cusec LIKE 'mun_%';")

    with open(out_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))

    print(f"\n✅ SQL generado: {out_path}")
    print(f"   {inserted} municipios con geometría")
    print(f"   {skipped} omitidos")
    total_pop = matched["population"].sum()
    print(f"   Población total: {int(total_pop):,} habitantes")
    print(f"\nPróximo paso: ejecutar {out_path} en Supabase → SQL Editor")


def main():
    args = parse_args()

    print("=" * 55)
    print("ETL: Municipios España → census_sections (Supabase)")
    print("=" * 55)

    print("\n1. Cargando INE CSV...")
    ine_df = load_ine(args.ine)
    print(f"   {len(ine_df)} municipios, {ine_df['population'].sum():,} habitantes")

    print("\n2. Cargando shapefile IGN...")
    gdf = load_shp(args.shp, args.simplify)

    print("\n3. Uniendo por código INE...")
    matched = match_municipalities(gdf, ine_df)

    print("\n4. Generando SQL...")
    generate_sql(matched, args.out)


if __name__ == "__main__":
    main()
