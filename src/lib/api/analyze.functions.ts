import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { geocode } from "./geocoding.server";
import { getCourtsInRadius } from "./courts.server";
import { getNationalBenchmarks } from "./benchmarks.server";
import { getSupabaseClient } from "@/lib/supabase.server";

// Score weights
const SCORE_W_HAB_PER_COURT = 0.50;
const SCORE_W_INDOOR_DEFICIT = 0.35;
const SCORE_W_NEAREST_CLUB   = 0.15;

// Factor 1 thresholds: hab/pista (piecewise: MIN→0, national avg→6, MAX→10).
// The neutral mid-point (score 6) is the national average, read from the DB.
const SCORE_HAB_MAX = 5000; // ratio ≥ this → score 10
const SCORE_HAB_MIN = 1000; // ratio ≤ this → score 0

// Factor 2 thresholds: indoor deficit in percentage points vs national
const SCORE_INDOOR_MAX_PP = 15;  // +15pp deficit → score 10
const SCORE_INDOOR_MIN_PP = -15; // -15pp surplus → score 0

// Factor 3 thresholds: distance to nearest competitor in km
const SCORE_DIST_MAX = 5.0; // ≥ 5km → score 10
const SCORE_DIST_MID = 2.0; // 2km → score 5 (piecewise anchor)
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

    // National benchmarks (editable from the `benchmarks` DB table)
    const bench = await getNationalBenchmarks();
    // Factor 1 neutral point = national average, clamped inside (MIN, MAX)
    const habMid = Math.min(
      SCORE_HAB_MAX - 1,
      Math.max(SCORE_HAB_MIN + 1, bench.inhabitantsPerCourt),
    );

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
    const saturationRatio = totalCourts > 0 ? habPerCourt / bench.inhabitantsPerCourt : 999;
    const saturation =
      saturationRatio > 2.0 ? "baja"
        : saturationRatio > 1.2 ? "media"
        : saturationRatio > 0.7 ? "alta"
        : "saturada";
    const indoorDeficitPp = Math.round((bench.indoorRatio - indoorRatio) * 100);

    // Step 6: Opportunity score (3 factors)
    // Factor 1: hab/pista ratio (50%) — piecewise: MIN→0, national avg→6, MAX→10
    const f1 = habPerCourt >= SCORE_HAB_MAX
      ? 10
      : habPerCourt <= SCORE_HAB_MIN
        ? 0
        : habPerCourt >= habMid
          ? 6 + ((habPerCourt - habMid) / (SCORE_HAB_MAX - habMid)) * 4
          : ((habPerCourt - SCORE_HAB_MIN) / (habMid - SCORE_HAB_MIN)) * 6;

    // Factor 2: indoor deficit in pp vs national (35%)
    const f2 = indoorDeficitPp >= SCORE_INDOOR_MAX_PP
      ? 10
      : indoorDeficitPp <= SCORE_INDOOR_MIN_PP
        ? 0
        : ((indoorDeficitPp - SCORE_INDOOR_MIN_PP) / (SCORE_INDOOR_MAX_PP - SCORE_INDOOR_MIN_PP)) * 10;

    // Factor 3: distance to nearest competitor (15%) — piecewise: 0.5→0, 2→5, 5→10
    const nearestKm = courts.length > 0 ? courts[0].distance_m / 1000 : radius;
    const f3 = nearestKm >= SCORE_DIST_MAX
      ? 10
      : nearestKm <= SCORE_DIST_MIN
        ? 0
        : nearestKm >= SCORE_DIST_MID
          ? 5 + ((nearestKm - SCORE_DIST_MID) / (SCORE_DIST_MAX - SCORE_DIST_MID)) * 5
          : ((nearestKm - SCORE_DIST_MIN) / (SCORE_DIST_MID - SCORE_DIST_MIN)) * 5;

    const score = Math.round(
      (f1 * SCORE_W_HAB_PER_COURT + f2 * SCORE_W_INDOOR_DEFICIT + f3 * SCORE_W_NEAREST_CLUB) * 10
    ) / 10;

    const risk = nearestKm < 3 ? "alto" : nearestKm <= 5 ? "medio" : "bajo";

    const opportunities: string[] = [];
    const risks: string[] = [];
    const localIndoorPct = Math.round(indoorRatio * 100);
    const nationalIndoorPct = Math.round(bench.indoorRatio * 100);
    const fmt = (n: number) => n.toLocaleString("es-ES");

    // O1 — Mercado infraservido
    if (habPerCourt > bench.inhabitantsPerCourt * 1.2) {
      const pct = Math.round((habPerCourt / bench.inhabitantsPerCourt - 1) * 100);
      opportunities.push(`La zona tiene ${fmt(habPerCourt)} hab/pista, un ${pct}% por encima de la media nacional (${fmt(bench.inhabitantsPerCourt)}). Existe demanda real no cubierta por la oferta actual.`);
    }

    // O2 — Déficit indoor concreto
    if (indoorDeficitPp > 5) {
      opportunities.push(`Solo el ${localIndoorPct}% de las pistas son indoor, frente al ${nationalIndoorPct}% de media en España — un déficit de ${indoorDeficitPp} puntos porcentuales. Hueco claro para un club cubierto.`);
    }

    // O3 — Sin competencia en el entorno inmediato
    if (nearestKm > 3) {
      opportunities.push(`El club más cercano está a ${nearestKm.toFixed(1)} km. El radio de captación no tiene competencia directa en el entorno inmediato.`);
    }

    // O4 — Mercado de gran volumen
    if (population > 100000) {
      opportunities.push(`${fmt(population)} habitantes en un radio de ${radius} km. Masa crítica suficiente para sostener distintos formatos y segmentos de cliente.`);
    }

    // O5 — Escasez absoluta de pistas
    if (totalCourts < 10 && population > 50000) {
      opportunities.push(`Solo ${totalCourts} pistas detectadas para ${fmt(population)} habitantes. La oferta es escasa en términos absolutos, no solo relativa a la media.`);
    }

    if (opportunities.length === 0) {
      opportunities.push("No se identifican ventajas estructurales destacadas en esta ubicación con los datos disponibles.");
    }

    // R1 — Zona saturada
    if (habPerCourt < bench.inhabitantsPerCourt * 0.8) {
      const pct = Math.round((1 - habPerCourt / bench.inhabitantsPerCourt) * 100);
      risks.push(`La zona tiene ${fmt(habPerCourt)} hab/pista, un ${pct}% por debajo de la media nacional. Alta densidad de oferta respecto a la demanda potencial.`);
    }

    // R2 — Competidor muy cercano
    if (nearestKm < 3) {
      risks.push(`Hay un club a ${nearestKm.toFixed(1)} km del punto analizado. La zona de captación se solapa directamente con oferta ya establecida.`);
    }

    // R3 — Indoor ya cubierto
    if (indoorDeficitPp < -5) {
      risks.push(`El ${localIndoorPct}% de las pistas son indoor, ${Math.abs(indoorDeficitPp)}pp por encima de la media nacional. El formato cubierto no es un diferenciador en esta zona.`);
    }

    // R4 — Mercado pequeño
    if (population < 50000) {
      risks.push(`El radio de ${radius} km concentra ${fmt(population)} habitantes. Mercado potencial limitado para un club de tamaño estándar.`);
    }

    // R5 — Alta concentración de clubes
    if (courts.length > 8) {
      risks.push(`${courts.length} clubes activos en el radio de ${radius} km. Entorno altamente competitivo con múltiples alternativas ya consolidadas.`);
    }

    if (risks.length === 0) {
      risks.push("No se identifican factores de riesgo significativos en esta ubicación.");
    }

    saveAnalysis(query, radius, lat, lng, address).catch(() => {});

    return {
      query,
      radius,
      coords: { lat, lng },
      addressResolved: address,
      summary: {
        opportunityScore: score,
        demandLevel: habPerCourt >= 6000
          ? "Muy alta"
          : habPerCourt >= bench.inhabitantsPerCourt
            ? "Alta"
            : habPerCourt >= 2500
              ? "Media"
              : habPerCourt >= 1500
                ? "Baja"
                : "Muy baja",
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
          habPerCourt: bench.inhabitantsPerCourt,
          habPerIndoor: bench.inhabitantsPerIndoor,
          habPerOutdoor: Math.round(bench.inhabitantsPerCourt / (1 - bench.indoorRatio)),
          indoorRatio: Math.round(bench.indoorRatio * 100),
          outdoorRatio: Math.round((1 - bench.indoorRatio) * 100),
        },
      },
      pricing: {
        valle: bench.avgPriceValley,
        punta: bench.avgPricePeak,
      },
      clubsNearby: courts.map((c, i) => ({
        id: i,
        name: c.club_name ?? c.name ?? `Club ${i + 1}`,
        type: c.is_indoor ? "indoor" : "outdoor",
        courts: c.court_count,
        distance_km: Math.round(c.distance_m / 100) / 10,
        lat: c.lat,
        lng: c.lng,
      })),
      recommendation: {
        summary: `${totalCourts} pistas detectadas para ${population.toLocaleString("es-ES")} habitantes en radio de ${radius} km (${habPerCourt.toLocaleString("es-ES")} hab/pista). ${indoorDeficitPp > 5 ? `Déficit indoor de ${indoorDeficitPp}pp vs media nacional.` : "Cobertura indoor adecuada."} Competidor más cercano a ${nearestKm.toFixed(1)} km.`,
        opportunities,
        risks,
      },
    };
  });

export type AnalysisResult = Awaited<ReturnType<typeof analyzeLocation>>;

async function getPopulation(lat: number, lng: number, radiusKm: number): Promise<number> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc("demographics_in_radius", {
    center_lat: lat,
    center_lng: lng,
    radius_meters: radiusKm * 1000,
  });

  if (error) throw new Error(`Error consultando datos del INE: ${error.message}`);
  if (!data?.[0]?.population) throw new Error("No se encontraron datos de población del INE para esta ubicación.");

  return data[0].population;
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
