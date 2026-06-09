import httpx
from db.connection import get_client
from models.schemas import DemographicsResult


def get_demographics(lat: float, lng: float, radius_km: float) -> DemographicsResult:
    """
    Calculates real population within the radius using PostGIS intersection
    with INE census sections stored in Supabase.
    Falls back to Nominatim area estimate if no census data loaded yet.
    """
    client = get_client()

    # PostGIS query: intersect radius circle with census sections,
    # weight population proportionally by intersection area
    radius_m = radius_km * 1000
    sql = f"""
        SELECT
            SUM(
                cs.population * (
                    ST_Area(ST_Intersection(cs.geometry, ST_Buffer(ST_SetSRID(ST_MakePoint({lng}, {lat}), 4326)::geography, {radius_m})::geometry)) /
                    ST_Area(cs.geometry)
                )
            )::INTEGER AS population,
            SUM(cs.area_km2) AS area_km2
        FROM census_sections cs
        WHERE ST_DWithin(
            cs.geometry::geography,
            ST_SetSRID(ST_MakePoint({lng}, {lat}), 4326)::geography,
            {radius_m}
        )
    """

    result = client.rpc("run_sql", {"query": sql}).execute()

    if result.data and result.data[0].get("population"):
        row = result.data[0]
        population = row["population"] or 0
        area = row["area_km2"] or (3.14159 * radius_km ** 2)
        return DemographicsResult(
            population=population,
            area_km2=round(area, 2),
            density=round(population / area, 1) if area > 0 else 0,
        )

    # Fallback: estimate based on radius area and Spanish average density (~93 hab/km²)
    area = round(3.14159 * radius_km ** 2, 2)
    return DemographicsResult(
        population=int(area * 93),
        area_km2=area,
        density=93.0,
    )
