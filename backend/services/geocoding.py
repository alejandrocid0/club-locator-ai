import httpx
from geopy.geocoders import Nominatim
from geopy.exc import GeocoderTimedOut


def geocode(query: str) -> tuple[float, float, str]:
    """
    Converts an address or Google Maps URL to (lat, lng, resolved_address).
    Uses Nominatim (OpenStreetMap) — free, no API key needed.
    """
    # Handle Google Maps URLs
    clean_query = _extract_from_maps_url(query) if "maps" in query else query

    geolocator = Nominatim(user_agent="club-locator-ai/1.0")

    try:
        location = geolocator.geocode(clean_query, language="es", country_codes="es", timeout=10)
    except GeocoderTimedOut:
        raise ValueError(f"Timeout al geocodificar: {clean_query}")

    if location is None:
        raise ValueError(f"No se encontró la ubicación: {clean_query}")

    return location.latitude, location.longitude, location.address


def _extract_from_maps_url(url: str) -> str:
    """Extracts coordinates or place name from a Google Maps URL."""
    import re

    # Format: @lat,lng
    match = re.search(r"@(-?\d+\.\d+),(-?\d+\.\d+)", url)
    if match:
        lat, lng = match.group(1), match.group(2)
        return f"{lat}, {lng}"

    # Format: place/Name+of+Place
    match = re.search(r"place/([^/]+)", url)
    if match:
        place = match.group(1).replace("+", " ").replace("%20", " ")
        return place

    return url
