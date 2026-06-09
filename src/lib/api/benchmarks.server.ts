import { getSupabaseClient } from "@/lib/supabase.server";

// National benchmarks consumed by the analysis pipeline. These live in the
// `benchmarks` table (scope='national', scope_name='España') so they can be
// tuned from the database without touching code. The DEFAULTS below are a
// safety net used only if the table is empty or unreachable — they mirror the
// seed data in backend/db/schema.sql.
export type NationalBenchmarks = {
  inhabitantsPerCourt: number;
  inhabitantsPerIndoor: number;
  indoorRatio: number; // 0-1
  avgPriceValley: number;
  avgPricePeak: number;
};

const DEFAULTS: NationalBenchmarks = {
  inhabitantsPerCourt: 3800,
  inhabitantsPerIndoor: 18000,
  indoorRatio: 0.21,
  avgPriceValley: 8.5,
  avgPricePeak: 14.0,
};

// Maps the `metric` column in the benchmarks table to our typed keys.
const METRIC_MAP: Record<string, keyof NationalBenchmarks> = {
  inhabitants_per_court: "inhabitantsPerCourt",
  inhabitants_per_indoor_court: "inhabitantsPerIndoor",
  indoor_ratio: "indoorRatio",
  avg_price_valley: "avgPriceValley",
  avg_price_peak: "avgPricePeak",
};

// Benchmarks change rarely; cache them briefly to avoid a DB roundtrip on every
// analysis while still picking up edits within a few minutes.
const CACHE_TTL_MS = 5 * 60 * 1000;
let cache: { value: NationalBenchmarks; expires: number } | null = null;

export async function getNationalBenchmarks(): Promise<NationalBenchmarks> {
  if (cache && cache.expires > Date.now()) return cache.value;

  const result = { ...DEFAULTS };

  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("benchmarks")
      .select("metric, value")
      .eq("scope", "national")
      .eq("scope_name", "España");

    if (!error && data) {
      for (const row of data as { metric: string; value: number | null }[]) {
        const key = METRIC_MAP[row.metric];
        if (key && typeof row.value === "number") {
          result[key] = row.value;
        }
      }
    }
  } catch {
    // Keep defaults on any failure.
  }

  cache = { value: result, expires: Date.now() + CACHE_TTL_MS };
  return result;
}
