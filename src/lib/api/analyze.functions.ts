import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { geocode } from "./geocoding.server";
import { getCourtsInRadius } from "./courts.server";
import { getSupabaseClient } from "@/lib/supabase.server";

const NATIONAL_INHABITANTS_PER_COURT = 3800;
const NATIONAL_INHABITANTS_PER_INDOOR = 18000;
const NATIONAL_INDOOR_RATIO = 0.21;
const NATIONAL_AVG_VALLEY = 8.5;
const NATIONAL_AVG_PEAK = 14.0;
const SPAIN_AVG_DENSITY = 93;

// Score weights
const SCORE_W_HAB_PER_COURT = 0.50;
const SCORE_W_INDOOR_DEFICIT = 0.35;
const SCORE_W_NEAREST_CLUB   = 0.15;

// Factor 1 thresholds: hab/pista
const SCORE_HAB_MAX = 5000; // ratio ≥ this → score 10
const SCORE_HAB_MIN = 1000; // ratio ≤ this → score 0

// Factor 2 thresholds: indoor deficit in percentage points vs national
const SCORE_INDOOR_MAX_PP = 15;  // +15pp deficit → score 10
const SCORE_INDOOR_MIN_PP = -15; // -15pp surplus → score 0

// Factor 3 thresholds: distance to nearest competitor in km
const SCORE_DIST_MAX = 5.0; // ≥ 5km → score 10
const SCORE_DIST_MID = 2.0; // 2km → score 5
const SCORE_DIST_MIN = 0.5; // ≤ 0.5km → score 0

export const analyzeLocation = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      query: z.string().min(1),
      radius: z.number().min(1).max(50),
      lat: z.number().optional(),
      lng: z.number().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const { query, radius } = data;

    // Step 1: Use provided coords (from map pin) or geocode as fallback
    const { lat, lng, address } =
      data.lat && data.lng
        ? { lat: data.lat, lng: data.lng, address: query }
        : await geocode(query);

    // Step 2: Population from Supabase PostGIS (falls back to estimate)
    const population = await getPopulation(lat, lng, radius);

    // Step 3: Courts from DB
    const courts = await getCourtsInRadius(lat, lng, radius);

    // Step 4: Aggregate supply
    const totalCourts = courts.reduce((sum, c) => sum + c.court_count, 0);
    const indoorCourts = courts.filter((c) => c.is_indoor).reduce((sum, c) => sum + c.court_count, 0);
    const outdoorCourts = totalCourts - indoorCourts;
    const indoorRatio = totalCourts > 0 ? indoorCourts / totalCourts : 0;

    // Step 5: Ratios
    const habPerCourt = totalCourts > 0 ? Math.round(population / totalCourts) : population;
    const habPerIndoor = indoorCourts > 0 ? Math.round(population / indoorCourts) : null;
    const habPerOutdoor = outdoorCourts > 0 ? Math.round(population / outdoorCourts) : null;
    const saturationRatio = totalCourts > 0 ? habPerCourt / NATIONAL_INHABITANTS_PER_COURT : 999;
    const saturation =
      saturationRatio > 2.0 ? "baja"
        : saturationRatio > 1.2 ? "media"
        : saturationRatio > 0.7 ? "alta"
        : "saturada";
    const indoorDeficitPp = Math.round((NATIONAL_INDOOR_RATIO - indoorRatio) * 100);

    // Step 6: Opportunity score (3 factors)
    // Factor 1: hab/pista ratio (50%)
    const f1 = habPerCourt >= SCORE_HAB_MAX
      ? 10
      : habPerCourt <= SCORE_HAB_MIN
        ? 0
        : ((habPerCourt - SCORE_HAB_MIN) / (SCORE_HAB_MAX - SCORE_HAB_MIN)) * 10;

    // Factor 2: indoor deficit in pp vs national (35%)
    const f2 = indoorDeficitPp >= SCORE_INDOOR_MAX_PP
      ? 10
      : indoorDeficitPp <= SCORE_INDOOR_MIN_PP
        ? 0
        : ((indoorDeficitPp - SCORE_INDOOR_MIN_PP) / (SCORE_INDOOR_MAX_PP - SCORE_INDOOR_MIN_PP)) * 10;

    // Factor 3: distance to nearest competitor (15%)
    const nearestKm = courts.length > 0 ? courts[0].distance_m / 1000 : radius;
    const f3 = nearestKm >= SCORE_DIST_MAX
      ? 10
      : nearestKm <= SCORE_DIST_MIN
        ? 0
        : ((nearestKm - SCORE_DIST_MIN) / (SCORE_DIST_MAX - SCORE_DIST_MIN)) * 10;

    const score = Math.round(
      (f1 * SCORE_W_HAB_PER_COURT + f2 * SCORE_W_INDOOR_DEFICIT + f3 * SCORE_W_NEAREST_CLUB) * 10
    ) / 10;

    const risk = habPerCourt < NATIONAL_INHABITANTS_PER_COURT * 0.7
      ? "alto"
      : habPerCourt < NATIONAL_INHABITANTS_PER_COURT * 1.2
        ? "medio"
        : "bajo";

    const model =
      score >= 7 && indoorDeficitPp > 5
        ? "Club indoor (6-8 pistas cubiertas)"
        : score >= 7
          ? "Club mixto (4 indoor + 4 outdoor)"
          : score >= 5
            ? "Club outdoor con opción de expansión indoor"
            : "Análisis ampliado recomendado antes de invertir";

    const opportunities: string[] = [];
    const risks: string[] = [];
    if (indoorDeficitPp > 5) opportunities.push("Déficit de pistas indoor en la zona");
    if (habPerCourt > NATIONAL_INHABITANTS_PER_COURT * 1.5)
      opportunities.push("Mercado infraservido vs. media nacional");
    if (nearestKm > 3) opportunities.push(`Competidor más cercano a ${nearestKm.toFixed(1)} km`);
    if (habPerCourt < NATIONAL_INHABITANTS_PER_COURT)
      risks.push("Ratio hab/pista por debajo de la media nacional");
    if (totalCourts > 20) risks.push(`Alta densidad de pistas: ${totalCourts} en el radio`);
    if (nearestKm < 1) risks.push(`Competidor directo a ${nearestKm.toFixed(1)} km del punto`);

    saveAnalysis(query, radius, lat, lng, address).catch(() => {});

    return {
      query,
      radius,
      coords: { lat, lng },
      addressResolved: address,
      summary: {
        opportunityScore: score,
        demandLevel: score >= 7 ? "Muy alta" : score >= 5 ? "Alta" : "Media",
        indoorDeficit: Math.max(0, indoorDeficitPp),
        competitiveRisk: risk,
      },
      demographics: {
        population,
      },
      supply: {
        clubs: courts.length, // número de clubes únicos
        totalCourts,
        indoor: indoorCourts,
        outdoor: outdoorCourts,
      },
      benchmark: {
        habPerCourt,
        habPerIndoor: habPerIndoor ?? 0,
        habPerOutdoor: habPerOutdoor ?? 0,
        indoorRatio: Math.round(indoorRatio * 100),
        outdoorRatio: Math.round((1 - indoorRatio) * 100),
        saturation,
        spain: {
          habPerCourt: NATIONAL_INHABITANTS_PER_COURT,
          habPerIndoor: NATIONAL_INHABITANTS_PER_INDOOR,
          habPerOutdoor: Math.round(NATIONAL_INHABITANTS_PER_COURT / (1 - NATIONAL_INDOOR_RATIO)),
          indoorRatio: Math.round(NATIONAL_INDOOR_RATIO * 100),
          outdoorRatio: Math.round((1 - NATIONAL_INDOOR_RATIO) * 100),
        },
      },
      pricing: {
        valle: NATIONAL_AVG_VALLEY,
        punta: NATIONAL_AVG_PEAK,
      },
      clubsNearby: courts.map((c, i) => ({
        id: i,
        name: c.club_name ?? c.name ?? `Club ${i + 1}`,
        type: c.is_indoor ? "indoor" : "outdoor",
        courts: c.court_count,
        distance_km: Math.round(c.distance_m / 100) / 10,
        lat: c.lat,
        lng: c.lng,
        offset: {
          x:
            Math.cos((i / Math.max(courts.length, 1)) * 2 * Math.PI) *
            (c.distance_m / 1000 / radius),
          y:
            Math.sin((i / Math.max(courts.length, 1)) * 2 * Math.PI) *
            (c.distance_m / 1000 / radius),
        },
      })),
      recommendation: {
        summary: `${totalCourts} pistas detectadas para ${population.toLocaleString("es-ES")} habitantes en radio de ${radius} km (${habPerCourt.toLocaleString("es-ES")} hab/pista). ${indoorDeficitPp > 5 ? `Déficit indoor de ${indoorDeficitPp}pp vs media nacional.` : "Cobertura indoor adecuada."} Competidor más cercano a ${nearestKm.toFixed(1)} km.`,
        model,
        opportunities,
        risks,
      },
    };
  });

async function getPopulation(lat: number, lng: number, radiusKm: number): Promise<number> {
  try {
    const supabase = getSupabaseClient();
    const radiusM = radiusKm * 1000;

    const { data } = await supabase.rpc("demographics_in_radius", {
      center_lat: lat,
      center_lng: lng,
      radius_meters: radiusM,
    });

    if (data && data[0]?.population) {
      return data[0].population;
    }
  } catch {
    // Fall through to estimate
  }

  // Fallback estimate until INE data is loaded
  const area = Math.round(Math.PI * radiusKm ** 2);
  return Math.round(area * SPAIN_AVG_DENSITY);
}

async function saveAnalysis(
  query: string,
  radius: number,
  lat: number,
  lng: number,
  address: string,
) {
  const supabase = getSupabaseClient();
  await supabase
    .from("analysis_results")
    .insert({ query, radius_km: radius, lat, lng, address_resolved: address });
}
