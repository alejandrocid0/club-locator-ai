import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { geocode } from "./geocoding.server";
import { getClubsInRadius } from "./clubs.server";
import { getSupabaseClient } from "@/lib/supabase.server";

const NATIONAL_INHABITANTS_PER_COURT = 3800;
const NATIONAL_INHABITANTS_PER_INDOOR = 18000;
const NATIONAL_INDOOR_RATIO = 0.21;
const NATIONAL_AVG_VALLEY = 8.5;
const NATIONAL_AVG_PEAK = 14.0;
const SPAIN_AVG_DENSITY = 93; // hab/km²

export const analyzeLocation = createServerFn({ method: "POST" })
  .validator(z.object({ query: z.string().min(1), radius: z.number().min(1).max(50) }))
  .handler(async ({ data }) => {
    const { query, radius } = data;

    // Step 1: Geocode
    const { lat, lng, address } = await geocode(query);

    // Step 2: Demographics from Supabase PostGIS (falls back to estimate)
    const demographics = await getDemographics(lat, lng, radius);

    // Step 3: Clubs from DB + OSM
    const clubs = await getClubsInRadius(lat, lng, radius);

    // Step 4: Aggregate supply
    const totalCourts = clubs.reduce((s, c) => s + c.total_courts, 0);
    const indoorCourts = clubs.reduce((s, c) => s + c.indoor_courts, 0);
    const outdoorCourts = clubs.reduce((s, c) => s + c.outdoor_courts, 0);
    const indoorRatio = totalCourts > 0 ? indoorCourts / totalCourts : 0;

    // Step 5: Ratios
    const habPerCourt = totalCourts > 0 ? Math.round(demographics.population / totalCourts) : demographics.population;
    const habPerIndoor = indoorCourts > 0 ? Math.round(demographics.population / indoorCourts) : null;
    const ratioVsNational = totalCourts > 0 ? habPerCourt / NATIONAL_INHABITANTS_PER_COURT : 999;
    const saturation =
      ratioVsNational > 2.0 ? "baja" : ratioVsNational > 1.2 ? "media" : ratioVsNational > 0.7 ? "alta" : "saturada";
    const indoorDeficit = indoorRatio < NATIONAL_INDOOR_RATIO || indoorCourts === 0;

    // Step 6: Pricing
    const clubsWithPricing = clubs.filter((c) => c.price_valley);
    const marketValley = clubsWithPricing.length
      ? clubsWithPricing.reduce((s, c) => s + (c.price_valley ?? 0), 0) / clubsWithPricing.length
      : null;
    const marketPeak = clubsWithPricing.length
      ? clubsWithPricing.filter((c) => c.price_peak).reduce((s, c) => s + (c.price_peak ?? 0), 0) / clubsWithPricing.length
      : null;
    const incomeFactor = demographics.avgIncome
      ? Math.min(1.3, Math.max(0.8, demographics.avgIncome / 32000))
      : 1.0;
    const recommendedValley = Math.round((marketValley ?? NATIONAL_AVG_VALLEY) * incomeFactor * 100) / 100;
    const recommendedPeak = Math.round((marketPeak ?? NATIONAL_AVG_PEAK) * incomeFactor * 100) / 100;

    // Step 7: Opportunity score
    let score = 50;
    score += { baja: 30, media: 15, alta: -10, saturada: -25 }[saturation] ?? 0;
    if (indoorDeficit) score += 15;
    if (demographics.population > 150000) score += 10;
    else if (demographics.population > 50000) score += 5;
    score = Math.max(0, Math.min(100, score));

    const risk = saturation === "saturada" ? "alto" : saturation === "alta" ? "medio" : "bajo";
    const indoorOpportunity = indoorDeficit ? "alta" : indoorRatio < 0.35 ? "moderada" : "ninguna";

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
    if (habPerCourt > NATIONAL_INHABITANTS_PER_COURT * 1.5) opportunities.push("Mercado infraservido vs. media nacional");
    if (demographics.population > 100000) opportunities.push("Masa crítica de población suficiente");
    if (demographics.avgIncome && demographics.avgIncome > 35000) opportunities.push("Renta media alta: pricing premium defendible");
    if (saturation === "alta" || saturation === "saturada") risks.push("Alta competencia ya establecida en la zona");
    if (clubs.length > 5) risks.push(`Mercado con ${clubs.length} clubes activos en el radio`);
    if (demographics.population < 30000) risks.push("Masa crítica de población limitada");

    // Save to history
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
        population: demographics.population,
        density: demographics.density,
        avgIncome: demographics.avgIncome,
        avgAge: demographics.avgAge,
      },
      supply: {
        clubs: clubs.length,
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
      clubsNearby: clubs.slice(0, 12).map((c, i) => ({
        id: i,
        name: c.name,
        type: c.has_indoor ? "indoor" : "outdoor",
        courts: c.total_courts,
        offset: {
          x: Math.cos((i / clubs.length) * 2 * Math.PI) * (c.distance_km / radius),
          y: Math.sin((i / clubs.length) * 2 * Math.PI) * (c.distance_km / radius),
        },
      })),
      recommendation: {
        summary: `Zona con saturación ${saturation}. ${clubs.length} clubes detectados, ${demographics.population.toLocaleString("es-ES")} habitantes en radio de análisis. ${indoorDeficit ? "Déficit indoor detectado." : "Cobertura indoor adecuada."}`,
        model,
        opportunities,
        risks,
      },
    };
  });

async function getDemographics(lat: number, lng: number, radiusKm: number) {
  try {
    const supabase = getSupabaseClient();
    const radiusM = radiusKm * 1000;

    const { data } = await supabase.rpc("demographics_in_radius", {
      center_lat: lat,
      center_lng: lng,
      radius_meters: radiusM,
    });

    if (data && data[0]?.population) {
      const row = data[0];
      const area = row.area_km2 || Math.PI * radiusKm ** 2;
      return {
        population: row.population,
        area_km2: area,
        density: Math.round(row.population / area),
        avgIncome: row.avg_income ?? null,
        avgAge: row.avg_age ?? null,
      };
    }
  } catch {
    // Fall through to estimate
  }

  // Fallback estimate until INE data is loaded
  const area = Math.round(Math.PI * radiusKm ** 2);
  return {
    population: Math.round(area * SPAIN_AVG_DENSITY),
    area_km2: area,
    density: SPAIN_AVG_DENSITY,
    avgIncome: null,
    avgAge: null,
  };
}

async function saveAnalysis(query: string, radius: number, lat: number, lng: number, address: string) {
  const supabase = getSupabaseClient();
  await supabase.table("analysis_results").insert({ query, radius_km: radius, lat, lng, address_resolved: address });
}
