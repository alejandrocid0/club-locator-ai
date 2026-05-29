from fastapi import APIRouter, HTTPException
from models.schemas import AnalyzeRequest, AnalysisResult, SupplyResult
from services.geocoding import geocode
from services.demographics import get_demographics
from services.clubs_search import get_clubs_in_radius
from services.scoring import calculate_ratios, calculate_pricing, calculate_recommendation

router = APIRouter()


@router.post("/analyze", response_model=AnalysisResult)
async def analyze_location(req: AnalyzeRequest):
    # Step 1: Geocode
    try:
        lat, lng, address_resolved = geocode(req.query)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    # Step 2: Demographics (PostGIS intersection with census sections)
    demographics = get_demographics(lat, lng, req.radius_km)

    # Step 3: Find clubs in radius
    clubs = get_clubs_in_radius(lat, lng, req.radius_km)

    # Step 4: Aggregate supply
    total_courts = sum(c.total_courts for c in clubs)
    indoor_courts = sum(c.indoor_courts for c in clubs)
    outdoor_courts = sum(c.outdoor_courts for c in clubs)
    indoor_ratio = indoor_courts / total_courts if total_courts > 0 else 0.0

    supply = SupplyResult(
        total_clubs=len(clubs),
        total_courts=total_courts,
        indoor_courts=indoor_courts,
        outdoor_courts=outdoor_courts,
        indoor_ratio=round(indoor_ratio, 3),
        clubs=clubs,
    )

    # Step 5: Ratios and benchmark comparison
    ratios = calculate_ratios(demographics, supply)

    # Step 6: Pricing recommendation
    pricing = calculate_pricing(supply, demographics)

    # Step 7: Opportunity scoring and recommendation
    recommendation = calculate_recommendation(ratios, supply, demographics, pricing)

    result = AnalysisResult(
        query=req.query,
        address_resolved=address_resolved,
        lat=lat,
        lng=lng,
        radius_km=req.radius_km,
        demographics=demographics,
        supply=supply,
        ratios=ratios,
        pricing=pricing,
        recommendation=recommendation,
    )

    # Save to history (non-blocking, best-effort)
    _save_analysis(result)

    return result


def _save_analysis(result: AnalysisResult):
    try:
        from db.connection import get_client
        client = get_client()
        client.table("analysis_results").insert({
            "query": result.query,
            "radius_km": result.radius_km,
            "lat": result.lat,
            "lng": result.lng,
            "address_resolved": result.address_resolved,
            "result": result.model_dump(),
        }).execute()
    except Exception:
        pass  # Never fail the main request due to history saving
