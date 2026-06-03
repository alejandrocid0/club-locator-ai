import { getSupabaseClient } from "@/lib/supabase.server";

export type CourtResult = {
  id: string;
  name: string | null;
  club_name: string | null;
  is_indoor: boolean;
  distance_m: number;
  court_count: number;
  lat: number;
  lng: number;
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
    name: r.club_name ?? r.name ?? null,
    club_name: r.club_name ?? null,
    is_indoor: r.is_indoor ?? false,
    distance_m: r.distance_m ?? 0,
    court_count: Number(r.court_count ?? 1),
    lat: r.lat ?? 0,
    lng: r.lng ?? 0,
  }));
}
