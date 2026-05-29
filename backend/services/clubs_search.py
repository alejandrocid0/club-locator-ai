import httpx
from db.connection import get_client
from models.schemas import ClubResult


def get_clubs_in_radius(lat: float, lng: float, radius_km: float) -> list[ClubResult]:
    """
    Returns padel clubs within radius from two sources (merged, deduplicated):
    1. Our own Supabase database (primary, enriched)
    2. OpenStreetMap Overpass API (fallback when DB is sparse)
    """
    own_clubs = _get_clubs_from_db(lat, lng, radius_km)

    if len(own_clubs) >= 3:
        return own_clubs

    # If our DB is sparse, enrich with OSM data
    osm_clubs = _get_clubs_from_osm(lat, lng, radius_km)
    return _merge(own_clubs, osm_clubs)


def _get_clubs_from_db(lat: float, lng: float, radius_km: float) -> list[ClubResult]:
    client = get_client()
    radius_m = radius_km * 1000

    response = client.rpc("clubs_in_radius", {
        "center_lat": lat,
        "center_lng": lng,
        "radius_meters": radius_m,
    }).execute()

    if not response.data:
        return []

    return [
        ClubResult(
            id=str(r["id"]),
            name=r["name"],
            distance_km=round(r.get("distance_m", 0) / 1000, 2),
            total_courts=r.get("total_courts") or 0,
            indoor_courts=r.get("indoor_courts") or 0,
            outdoor_courts=r.get("outdoor_courts") or 0,
            has_indoor=r.get("has_indoor") or False,
            price_valley=r.get("price_valley"),
            price_peak=r.get("price_peak"),
            rating=r.get("rating"),
            city=r.get("city"),
        )
        for r in response.data
    ]


def _get_clubs_from_osm(lat: float, lng: float, radius_km: float) -> list[ClubResult]:
    """Queries OpenStreetMap Overpass API for padel facilities."""
    radius_m = int(radius_km * 1000)
    overpass_url = "https://overpass-api.de/api/interpreter"

    query = f"""
    [out:json][timeout:25];
    (
      node["sport"="padel"](around:{radius_m},{lat},{lng});
      way["sport"="padel"](around:{radius_m},{lat},{lng});
      node["leisure"="sports_centre"]["sport"="padel"](around:{radius_m},{lat},{lng});
      way["leisure"="sports_centre"]["sport"="padel"](around:{radius_m},{lat},{lng});
    );
    out center tags;
    """

    try:
        response = httpx.post(overpass_url, data={"data": query}, timeout=30)
        response.raise_for_status()
        data = response.json()
    except Exception:
        return []

    clubs = []
    for element in data.get("elements", []):
        tags = element.get("tags", {})
        elem_lat = element.get("lat") or element.get("center", {}).get("lat")
        elem_lng = element.get("lon") or element.get("center", {}).get("lon")

        if not elem_lat or not elem_lng:
            continue

        name = tags.get("name") or tags.get("operator") or "Club sin nombre"
        distance_km = _haversine(lat, lng, elem_lat, elem_lng)

        clubs.append(ClubResult(
            id=f"osm_{element['id']}",
            name=name,
            distance_km=round(distance_km, 2),
            total_courts=0,
            indoor_courts=0,
            outdoor_courts=0,
            has_indoor=False,
            price_valley=None,
            price_peak=None,
            rating=None,
            city=tags.get("addr:city"),
        ))

    return clubs


def _merge(db_clubs: list[ClubResult], osm_clubs: list[ClubResult]) -> list[ClubResult]:
    """Merges DB and OSM clubs, avoiding duplicates by name proximity."""
    db_names = {c.name.lower() for c in db_clubs}
    unique_osm = [c for c in osm_clubs if c.name.lower() not in db_names]
    return db_clubs + unique_osm


def _haversine(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    from math import radians, sin, cos, sqrt, atan2
    R = 6371
    dlat = radians(lat2 - lat1)
    dlng = radians(lng2 - lng1)
    a = sin(dlat/2)**2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlng/2)**2
    return R * 2 * atan2(sqrt(a), sqrt(1 - a))
