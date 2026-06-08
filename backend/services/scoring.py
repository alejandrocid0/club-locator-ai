from db.connection import get_client
from models.schemas import (
    DemographicsResult, SupplyResult, RatiosResult,
    PricingResult, RecommendationResult
)


NATIONAL_INHABITANTS_PER_COURT = 3800
NATIONAL_INHABITANTS_PER_INDOOR = 18000
NATIONAL_INDOOR_RATIO = 0.21
NATIONAL_AVG_VALLEY = 8.50
NATIONAL_AVG_PEAK = 14.00


def calculate_ratios(demographics: DemographicsResult, supply: SupplyResult) -> RatiosResult:
    pop = demographics.population
    total = supply.total_courts
    indoor = supply.indoor_courts

    inh_per_court = round(pop / total, 0) if total > 0 else pop
    inh_per_indoor = round(pop / indoor, 0) if indoor > 0 else None

    # Saturation: compare local ratio vs national average
    # Lower ratio = more courts per person = more saturated
    ratio_vs_national = inh_per_court / NATIONAL_INHABITANTS_PER_COURT if total > 0 else 999

    if ratio_vs_national > 2.0:
        saturation = "low"
    elif ratio_vs_national > 1.2:
        saturation = "medium"
    elif ratio_vs_national > 0.7:
        saturation = "high"
    else:
        saturation = "saturated"

    indoor_deficit = (supply.indoor_ratio < NATIONAL_INDOOR_RATIO) or (indoor == 0)

    return RatiosResult(
        inhabitants_per_court=inh_per_court,
        inhabitants_per_indoor_court=inh_per_indoor,
        national_avg_inhabitants_per_court=NATIONAL_INHABITANTS_PER_COURT,
        national_avg_inhabitants_per_indoor_court=NATIONAL_INHABITANTS_PER_INDOOR,
        saturation_level=saturation,
        indoor_deficit=indoor_deficit,
    )


def calculate_pricing(supply: SupplyResult, demographics: DemographicsResult) -> PricingResult:
    clubs_with_pricing = [c for c in supply.clubs if c.price_valley]

    market_valley = (
        sum(c.price_valley for c in clubs_with_pricing) / len(clubs_with_pricing)
        if clubs_with_pricing else None
    )
    market_peak = (
        sum(c.price_peak for c in clubs_with_pricing if c.price_peak) / len(clubs_with_pricing)
        if clubs_with_pricing else None
    )

    # Income adjustment factor
    income_factor = 1.0
    if demographics.avg_income:
        national_avg_income = 32000
        income_factor = min(1.3, max(0.8, demographics.avg_income / national_avg_income))

    base_valley = market_valley or NATIONAL_AVG_VALLEY
    base_peak = market_peak or NATIONAL_AVG_PEAK

    return PricingResult(
        recommended_valley=round(base_valley * income_factor, 2),
        recommended_peak=round(base_peak * income_factor, 2),
        market_valley_avg=round(market_valley, 2) if market_valley else None,
        market_peak_avg=round(market_peak, 2) if market_peak else None,
    )


def calculate_recommendation(
    ratios: RatiosResult,
    supply: SupplyResult,
    demographics: DemographicsResult,
    pricing: PricingResult,
) -> RecommendationResult:

    # Factor 1: hab/pista (50%) — piecewise: 1000→0, 3800→6, 5000→10
    hab_per_court = ratios.inhabitants_per_court
    if hab_per_court >= 5000:
        f1 = 10.0
    elif hab_per_court >= 3800:
        f1 = 6.0 + (hab_per_court - 3800) / (5000 - 3800) * 4.0
    elif hab_per_court >= 1000:
        f1 = (hab_per_court - 1000) / (3800 - 1000) * 6.0
    else:
        f1 = 0.0

    # Factor 2: indoor deficit in pp vs national (35%) — linear: -15pp→0, +15pp→10
    indoor_ratio = supply.indoor_ratio if supply.total_courts > 0 else 0.0
    indoor_deficit_pp = (NATIONAL_INDOOR_RATIO - indoor_ratio) * 100
    if indoor_deficit_pp >= 15:
        f2 = 10.0
    elif indoor_deficit_pp <= -15:
        f2 = 0.0
    else:
        f2 = (indoor_deficit_pp - (-15)) / (15 - (-15)) * 10.0

    # Factor 3: distance to nearest competitor (15%) — piecewise: 0.5→0, 2→5, 5→10
    nearest_km = supply.clubs[0].distance_km if supply.clubs else 999.0
    if nearest_km >= 5.0:
        f3 = 10.0
    elif nearest_km >= 2.0:
        f3 = 5.0 + (nearest_km - 2.0) / (5.0 - 2.0) * 5.0
    elif nearest_km >= 0.5:
        f3 = (nearest_km - 0.5) / (2.0 - 0.5) * 5.0
    else:
        f3 = 0.0

    score = round(f1 * 0.50 + f2 * 0.35 + f3 * 0.15, 1)

    # Indoor opportunity label
    if indoor_deficit_pp > 5:
        indoor_opportunity = "high"
    elif indoor_deficit_pp > 0:
        indoor_opportunity = "moderate"
    else:
        indoor_opportunity = "none"

    # Risk level
    if hab_per_court < NATIONAL_INHABITANTS_PER_COURT * 0.7:
        risk = "high"
    elif hab_per_court < NATIONAL_INHABITANTS_PER_COURT * 1.2:
        risk = "medium"
    else:
        risk = "low"

    # Recommended model
    if score >= 7 and indoor_deficit_pp > 5:
        model = "Club indoor (6-8 pistas cubiertas)"
    elif score >= 7:
        model = "Club mixto (4 indoor + 4 outdoor)"
    elif score >= 5:
        model = "Club outdoor con opción de expansión indoor"
    else:
        model = "Análisis ampliado recomendado antes de invertir"

    opportunities = []
    risks = []

    if ratios.indoor_deficit:
        opportunities.append("Déficit de pistas indoor en la zona")
    if ratios.inhabitants_per_court > NATIONAL_INHABITANTS_PER_COURT * 1.5:
        opportunities.append("Mercado claramente infraservido vs. media nacional")
    if demographics.population > 100000:
        opportunities.append("Masa crítica de población suficiente")
    if demographics.avg_income and demographics.avg_income > 35000:
        opportunities.append("Renta media alta: pricing premium defendible")

    if ratios.saturation_level in ("high", "saturated"):
        risks.append("Alta competencia ya establecida en la zona")
    if supply.total_clubs > 5:
        risks.append(f"Mercado con {supply.total_clubs} clubes activos en el radio")
    if demographics.population < 30000:
        risks.append("Masa crítica de población limitada")

    summary = (
        f"Zona con {ratios.saturation_level} saturación. "
        f"{supply.total_clubs} clubes detectados, {demographics.population:,} habitantes en radio de análisis. "
        f"{'Déficit indoor detectado.' if ratios.indoor_deficit else 'Cobertura indoor adecuada.'}"
    )

    return RecommendationResult(
        opportunity_score=score,
        competitive_risk=risk,
        indoor_opportunity=indoor_opportunity,
        recommended_model=model,
        summary=summary,
        opportunities=opportunities,
        risks=risks,
    )
