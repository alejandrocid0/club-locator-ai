export async function geocode(query: string): Promise<{ lat: number; lng: number; address: string }> {
  const cleanQuery = extractFromMapsUrl(query);
  const encoded = encodeURIComponent(cleanQuery);
  const url = `https://nominatim.openstreetmap.org/search?q=${encoded}&format=json&addressdetails=1&countrycodes=es&limit=1&accept-language=es`;

  const res = await fetch(url, {
    headers: { "User-Agent": "club-locator-ai/1.0" },
  });

  if (!res.ok) throw new Error("Error al conectar con el servicio de geocodificación");

  const data = await res.json() as Array<{ lat: string; lon: string; display_name: string }>;

  if (!data.length) throw new Error(`No se encontró la ubicación: ${cleanQuery}`);

  return {
    lat: parseFloat(data[0].lat),
    lng: parseFloat(data[0].lon),
    address: data[0].display_name,
  };
}

function extractFromMapsUrl(input: string): string {
  if (!input.includes("maps")) return input;

  const coordMatch = input.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (coordMatch) return `${coordMatch[1]}, ${coordMatch[2]}`;

  const placeMatch = input.match(/place\/([^/]+)/);
  if (placeMatch) return placeMatch[1].replace(/\+/g, " ").replace(/%20/g, " ");

  return input;
}
