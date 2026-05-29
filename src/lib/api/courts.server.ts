import { getSupabaseClient } from "@/lib/supabase.server";

export type CourtResult = {
  id: string;
  name: string | null;
  is_indoor: boolean;
  distance_m: number;
};

export async function getCourtsInRadius(
  lat: number,
  lng: number,
  radiusKm: number,
): Promise<CourtResult[]> {
  const supabase = getSupabaseClient();
  const radiusMeters = radiusKm * 1000;

  const { data, error } = await supabase.rpc("courts_in_radius", {
    center_lat: lat,
    center_lng: lng,
    radius_meters: radiusMeters,
  });

  if (error || !data) return [];

  return data.map((r: any) => ({
    id: String(r.id),
    name: r.name ?? null,
    is_indoor: r.is_indoor ?? false,
    distance_m: r.distance_m ?? 0,
  }));
}
