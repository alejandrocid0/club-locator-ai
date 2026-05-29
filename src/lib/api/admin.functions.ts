import { createServerFn } from "@tanstack/react-start";
import { getSupabaseClient } from "@/lib/supabase.server";

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const SPAIN_BBOX = "27.6,-18.2,43.8,4.4";

const QUERY = `
[out:json][timeout:180];
(
  node["sport"="padel"](${SPAIN_BBOX});
  way["sport"="padel"](${SPAIN_BBOX});
  node["leisure"="pitch"]["sport"="padel"](${SPAIN_BBOX});
  way["leisure"="pitch"]["sport"="padel"](${SPAIN_BBOX});
  node["leisure"="sports_centre"]["sport"="padel"](${SPAIN_BBOX});
  way["leisure"="sports_centre"]["sport"="padel"](${SPAIN_BBOX});
);
out center tags;
`;

function isIndoor(tags: Record<string, string>): boolean {
  return (
    tags["indoor"] === "yes" ||
    tags["covered"] === "yes" ||
    ["yes", "sports_hall", "sport"].includes(tags["building"] ?? "")
  );
}

export const seedCourtsFromOSM = createServerFn({ method: "POST" }).handler(async () => {
  // Fetch from Overpass
  const res = await fetch(OVERPASS_URL, {
    method: "POST",
    body: `data=${encodeURIComponent(QUERY)}`,
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });

  if (!res.ok) throw new Error(`Overpass error: ${res.status}`);

  const json = (await res.json()) as { elements: any[] };
  const elements = json.elements ?? [];

  // Parse courts
  const courts = elements
    .map((el: any) => {
      const tags = el.tags ?? {};
      const lat = el.lat ?? el.center?.lat;
      const lng = el.lon ?? el.center?.lon;
      if (!lat || !lng) return null;
      return {
        osm_id: `${el.type}_${el.id}`,
        name: tags.name ?? tags.operator ?? null,
        lat,
        lng,
        is_indoor: isIndoor(tags),
        source: "osm",
        verified: false,
      };
    })
    .filter((c): c is NonNullable<typeof c> => c !== null);

  // Insert in batches of 200
  const supabase = getSupabaseClient();
  const batchSize = 200;
  let inserted = 0;

  for (let i = 0; i < courts.length; i += batchSize) {
    const batch = courts.slice(i, i + batchSize);
    await supabase.from("courts").upsert(batch, { onConflict: "osm_id", ignoreDuplicates: true });
    inserted += batch.length;
  }

  const indoor = courts.filter((c: any) => c?.is_indoor).length;
  const outdoor = courts.length - indoor;

  return {
    total: inserted,
    indoor,
    outdoor,
    message: `✅ ${inserted} pistas cargadas (${indoor} indoor, ${outdoor} outdoor)`,
  };
});
