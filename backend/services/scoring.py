import time
from dataclasses import dataclass

from db.connection import get_client
from models.schemas import (
    DemographicsResult, SupplyResult, RatiosResult,
    PricingResult, RecommendationResult
)


# National benchmarks live in the `benchmarks` table (scope='national',
# scope_name='España') so they can be tuned from the database without code
# changes. The dataclass defaults are a safety net used only when the table is
# empty or unreachable — they mirror the seed data in backend/db/schema.sql.
@dataclass
class NationalBenchmarks:
    inhabitants_per_court: float = 3800
    inhabitants_per_indoor: float = 18000
    indoor_ratio: float = 0.21
    avg_price_valley: float = 8.50
    avg_price_peak: float = 14.00


_METRIC_MAP = {
    "inhabitants_per_court": "inhabitants_per_court",
    "inhabitants_per_indoor_court": "inhabitants_per_indoor",
    "indoor_ratio": "indoor_ratio",
    "avg_price_valley": "avg_price_valley",
    "avg_price_peak": "avg_price_peak",
}

_CACHE_TTL = 300  # seconds
_bench_cache: tuple[NationalBenchmarks, float] | None = None


def get_national_benchmarks() -> NationalBenchmarks:
    global _bench_cache
    now = time.time()
    if _bench_cache and _bench_cache[1] > now:
        return _bench_cache[0]

    bench = NationalBenchmarks()
    try:
        res = (
            get_client()
            .table("benchmarks")
            .select("metric, value")
            .eq("scope", "national")
            .eq("scope_name", "España")
            .execute()
        )
        for row in res.data or []:
            attr = _METRIC_MAP.get(row.get("metric"))
            val = row.get("value")
            if attr and isinstance(val, (int, float)):
                setattr(bench, attr, float(val))
    except Exception:
        pass  # Keep defaults on any failure.

    _bench_cache = (bench, now + _CACHE_TTL)
    return bench


def calculate_ratios(demographics: DemographicsResult, supply: SupplyResult) -> RatiosResult:
    bench = get_national_benchmarks()
    pop = demographics.population
    total = supply.total_courts
    indoor = supply.indoor_courts

    inh_per_court = round(pop / total, 0) if total > 0 else pop
    inh_per_indoor = round(pop / indoor, 0) if indoor > 0 else None

    # Saturation: compare local ratio vs national average
    # Lower ratio = more courts per person = more saturated
    ratio_vs_national = inh_per_court / bench.inhabitants_per_court if total > 0 else 999

    if ratio_vs_national > 2.0:
        saturation = "low"
    elif ratio_vs_national > 1.2:
        saturation = "medium"
    elif ratio_vs_national > 0.7:
        saturation = "high"
    else:
        saturation = "saturated"

    indoor_deficit = (supply.indoor_ratio < bench.indoor_ratio) or (indoor == 0)

    return RatiosResult(
        inhabitants_per_court=inh_per_court,
        inhabitants_per_indoor_court=inh_per_indoor,
        national_avg_inhabitants_per_court=bench.inhabitants_per_court,
        national_avg_inhabitants_per_indoor_court=bench.inhabitants_per_indoor,
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

    bench = get_national_benchmarks()
    base_valley = market_valley or bench.avg_price_valley
    base_peak = market_peak or bench.avg_price_peak

    return PricingResult(
        recommended_valley=round(base_valley, 2),
        recommended_peak=round(base_peak, 2),
        market_valley_avg=round(market_valley, 2) if market_valley else None,
        market_peak_avg=round(market_peak, 2) if market_peak else None,
    )


def calculate_recommendation(
    ratios: RatiosResult,
    supply: SupplyResult,
    demographics: DemographicsResult,
    pricing: PricingResult,
) -> RecommendationResult:

    bench = get_national_benchmarks()
    # Factor 1 neutral point (score 6) = national average, clamped inside (1000, 5000)
    hab_mid = min(4999.0, max(1001.0, bench.inhabitants_per_court))

    # Factor 1: hab/pista (50%) — piecewise: 1000→0, national avg→6, 5000→10
    hab_per_court = ratios.inhabitants_per_court
    if hab_per_court >= 5000:
        f1 = 10.0
    elif hab_per_court >= hab_mid:
        f1 = 6.0 + (hab_per_court - hab_mid) / (5000 - hab_mid) * 4.0
    elif hab_per_court >= 1000:
        f1 = (hab_per_court - 1000) / (hab_mid - 1000) * 6.0
    else:
        f1 = 0.0

    # Factor 2: indoor deficit in pp vs national (35%) — linear: -15pp→0, +15pp→10
    indoor_ratio = supply.indoor_ratio if supply.total_courts > 0 else 0.0
    indoor_deficit_pp = (bench.indoor_ratio - indoor_ratio) * 100
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

    # Risk level: distance to nearest competitor
    if nearest_km < 3.0:
        risk = "high"
    elif nearest_km <= 5.0:
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
    if ratios.inhabitants_per_court > bench.inhabitants_per_court * 1.5:
        opportunities.append("Mercado claramente infraservido vs. media nacional")
    if demographics.population > 100000:
        opportunities.append("Masa crítica de población suficiente")

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
