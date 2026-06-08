from pydantic import BaseModel
from typing import Optional


class AnalyzeRequest(BaseModel):
    query: str
    radius_km: int = 10


class ClubResult(BaseModel):
    id: str
    name: str
    distance_km: float
    total_courts: int
    indoor_courts: int
    outdoor_courts: int
    has_indoor: bool
    price_valley: Optional[float]
    price_peak: Optional[float]
    rating: Optional[float]
    city: Optional[str]


class DemographicsResult(BaseModel):
    population: int
    area_km2: float
    density: float
    avg_income: Optional[float]
    avg_age: Optional[float]


class SupplyResult(BaseModel):
    total_clubs: int
    total_courts: int
    indoor_courts: int
    outdoor_courts: int
    indoor_ratio: float
    clubs: list[ClubResult]


class RatiosResult(BaseModel):
    inhabitants_per_court: float
    inhabitants_per_indoor_court: Optional[float]
    national_avg_inhabitants_per_court: float
    national_avg_inhabitants_per_indoor_court: float
    saturation_level: str          # 'low' | 'medium' | 'high' | 'saturated'
    indoor_deficit: bool


class PricingResult(BaseModel):
    recommended_valley: float
    recommended_peak: float
    market_valley_avg: Optional[float]
    market_peak_avg: Optional[float]


class RecommendationResult(BaseModel):
    opportunity_score: float       # 0-10
    competitive_risk: str          # 'low' | 'medium' | 'high'
    indoor_opportunity: str        # 'none' | 'moderate' | 'high'
    recommended_model: str
    summary: str
    opportunities: list[str]
    risks: list[str]


class AnalysisResult(BaseModel):
    query: str
    address_resolved: str
    lat: float
    lng: float
    radius_km: int
    demographics: DemographicsResult
    supply: SupplyResult
    ratios: RatiosResult
    pricing: PricingResult
    recommendation: RecommendationResult
