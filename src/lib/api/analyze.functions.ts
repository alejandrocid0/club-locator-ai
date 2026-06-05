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
const SPAIN_AVG_DENSITY = 93; // hab/km²

export const analyzeLocation = createServerFn({ method: "POST" })
  .inputValidator(z.object({ query: z.string().min(1), radius: z.number().min(1).max(50) }))
  .handler(async ({ data }) => {
    const { query, radius } = data;

    // Step 1: Geocode
    const { lat, lng, address } = await geocode(query);

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
    const ratioVsNational = totalCourts > 0 ? habPerCourt / NATIONAL_INHABITANTS_PER_COURT : 999;
    const saturation =
      ratioVsNational > 2.0
        ? "baja"
        : ratioVsNational > 1.2
          ? "media"
          : ratioVsNational > 0.7
            ? "alta"
            : "saturada";
    const indoorDeficit = indoorRatio < NATIONAL_INDOOR_RATIO || indoorCourts === 0;

    // Step 6: Pricing (fixed national base, no income adjustment)
    const recommendedValley = NATIONAL_AVG_VALLEY;
    const recommendedPeak = NATIONAL_AVG_PEAK;

    // Step 7: Opportunity score
    let score = 50;
    score += { baja: 30, media: 15, alta: -10, saturada: -25 }[saturation] ?? 0;
    if (indoorDeficit) score += 15;
    if (population > 150000) score += 10;
    else if (population > 50000) score += 5;
    score = Math.max(0, Math.min(100, score));

    const risk = saturation === "saturada" ? "alto" : saturation === "alta" ? "medio" : "bajo";

    const model =
      score >= 70 && indoorDeficit
        ? "Club indoor premium (6-8 pistas cubiertas)"
        : score >= 70
          ? "Club mixto (4 indoor + 4 outdoor)"
          : score >= 50
            ? "Club outdoor con opción de expansión indoor"
            : "Análisis ampliado recomendado antes de invertir";

    const opportunities: string[] = [];
    const risks: string[] = [];
    if (indoorDeficit) opportunities.push("Déficit de pistas indoor en la zona");
    if (habPerCourt > NATIONAL_INHABITANTS_PER_COURT * 1.5)
      opportunities.push("Mercado infraservido vs. media nacional");
    if (population > 100000) opportunities.push("Masa crítica de población suficiente");
    if (saturation === "alta" || saturation === "saturada")
      risks.push("Alta competencia ya establecida en la zona");
    if (totalCourts > 20) risks.push(`Alta densidad de pistas: ${totalCourts} en el radio`);
    if (population < 30000) risks.push("Masa crítica de población limitada");

    saveAnalysis(query, radius, lat, lng, address).catch(() => {});

    return {
      query,
      radius,
      coords: { lat, lng },
      addressResolved: address,
      summary: {
        opportunityScore: score / 10,
        demandLevel: score >= 70 ? "Muy alta" : score >= 55 ? "Alta" : "Media",
        indoorDeficit: Math.round((1 - indoorRatio / NATIONAL_INDOOR_RATIO) * 100),
        premiumPotential: score >= 65 ? "Alto" : "Medio",
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
        indoorRatio: Math.round(indoorRatio * 100),
        saturation,
        spain: {
          habPerCourt: NATIONAL_INHABITANTS_PER_COURT,
          habPerIndoor: NATIONAL_INHABITANTS_PER_INDOOR,
          indoorRatio: Math.round(NATIONAL_INDOOR_RATIO * 100),
        },
        premium: { habPerCourt: 1800, habPerIndoor: 4200, indoorRatio: 58 },
      },
      pricing: {
        valle: recommendedValley,
        punta: recommendedPeak,
        premium: Math.round(recommendedPeak * 1.4 * 100) / 100,
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
        summary: `Zona con saturación ${saturation}. ${totalCourts} pistas detectadas, ${population.toLocaleString("es-ES")} habitantes en radio de ${radius} km. ${indoorDeficit ? "Déficit indoor detectado." : "Cobertura indoor adecuada."}`,
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
