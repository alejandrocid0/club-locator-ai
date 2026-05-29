import { getSupabaseClient } from "@/lib/supabase.server";

export type ClubResult = {
  id: string;
  name: string;
  distance_km: number;
  total_courts: number;
  indoor_courts: number;
  outdoor_courts: number;
  has_indoor: boolean;
  price_valley: number | null;
  price_peak: number | null;
  rating: number | null;
  city: string | null;
};

export async function getClubsInRadius(
  lat: number,
  lng: number,
  radiusKm: number,
): Promise<ClubResult[]> {
  const supabase = getSupabaseClient();
  const radiusMeters = radiusKm * 1000;

  const { data, error } = await supabase.rpc("clubs_in_radius", {
    center_lat: lat,
    center_lng: lng,
    radius_meters: radiusMeters,
  });

  const dbClubs: ClubResult[] =
    !error && data
      ? data.map((r: any) => ({
          id: String(r.id),
          name: r.name,
          distance_km: Math.round((r.distance_m / 1000) * 100) / 100,
          total_courts: r.total_courts ?? 0,
          indoor_courts: r.indoor_courts ?? 0,
          outdoor_courts: r.outdoor_courts ?? 0,
          has_indoor: r.has_indoor ?? false,
          price_valley: r.price_valley ?? null,
          price_peak: r.price_peak ?? null,
          rating: r.rating ?? null,
          city: r.city ?? null,
        }))
      : [];

  if (dbClubs.length >= 3) return dbClubs;

  // Fallback: enrich with OpenStreetMap if our DB is sparse
  const osmClubs = await getClubsFromOSM(lat, lng, radiusKm);
  const dbNames = new Set(dbClubs.map((c) => c.name.toLowerCase()));
  const uniqueOsm = osmClubs.filter((c) => !dbNames.has(c.name.toLowerCase()));

  return [...dbClubs, ...uniqueOsm];
}

async function getClubsFromOSM(lat: number, lng: number, radiusKm: number): Promise<ClubResult[]> {
  const radiusM = radiusKm * 1000;
  const query = `
    [out:json][timeout:25];
    (
      node["sport"="padel"](around:${radiusM},${lat},${lng});
      way["sport"="padel"](around:${radiusM},${lat},${lng});
      node["leisure"="sports_centre"]["sport"="padel"](around:${radiusM},${lat},${lng});
      way["leisure"="sports_centre"]["sport"="padel"](around:${radiusM},${lat},${lng});
    );
    out center tags;
  `;

  try {
    const res = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      body: `data=${encodeURIComponent(query)}`,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });

    if (!res.ok) return [];

    const json = (await res.json()) as { elements: any[] };

    return json.elements
      .map((el: any) => {
        const elLat = el.lat ?? el.center?.lat;
        const elLng = el.lon ?? el.center?.lon;
        if (!elLat || !elLng) return null;

        return {
          id: `osm_${el.id}`,
          name: el.tags?.name ?? el.tags?.operator ?? "Club sin nombre",
          distance_km: haversine(lat, lng, elLat, elLng),
          total_courts: 0,
          indoor_courts: 0,
          outdoor_courts: 0,
          has_indoor: false,
          price_valley: null,
          price_peak: null,
          rating: null,
          city: el.tags?.["addr:city"] ?? null,
        } as ClubResult;
      })
      .filter(Boolean) as ClubResult[];
  } catch {
    return [];
  }
}

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 100) / 100;
}
