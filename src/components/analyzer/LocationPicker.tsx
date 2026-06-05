import { useState, lazy, Suspense } from "react";
import { Search, MapPin, Loader2, Navigation } from "lucide-react";
import { Button } from "@/components/ui/button";

const LocationPickerMap = lazy(() => import("./LocationPickerMap"));

const FIXED_RADIUS = 10;

async function geocodeQuery(q: string) {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1&countrycodes=es&accept-language=es`,
  );
  if (!res.ok) return null;
  const data = await res.json();
  if (!data.length) return null;
  return {
    lat: parseFloat(data[0].lat),
    lng: parseFloat(data[0].lon),
    address: data[0].display_name as string,
  };
}

export function LocationPicker({
  onAnalyze,
  loading,
}: {
  onAnalyze: (query: string, lat: number, lng: number, radius: number) => void;
  loading: boolean;
}) {
  const [query, setQuery] = useState("");
  const [geocoding, setGeocoding] = useState(false);
  const [pin, setPin] = useState<{ lat: number; lng: number; address: string } | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setGeocoding(true);
    setGeoError(null);
    const result = await geocodeQuery(query.trim());
    setGeocoding(false);
    if (!result) {
      setGeoError("No se encontró la dirección. Intenta ser más específico.");
      return;
    }
    setPin(result);
  };

  return (
    <div className="w-full max-w-3xl mx-auto space-y-4">
      <div className="relative flex items-center gap-2 rounded-lg border border-border bg-card p-2 focus-within:border-primary transition-colors">
        <div className="pl-3 text-muted-foreground">
          <MapPin className="size-5" />
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          placeholder="Escribe una dirección o ciudad…"
          className="flex-1 bg-transparent outline-none text-foreground placeholder:text-muted-foreground py-3 text-base"
          disabled={loading}
        />
        <Button
          size="lg"
          disabled={!query.trim() || geocoding || loading}
          onClick={handleSearch}
          className="rounded-md bg-primary text-primary-foreground font-bold shadow-none hover:bg-primary/90"
        >
          {geocoding ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Search className="size-4" />
          )}
          <span className="ml-2">Buscar</span>
        </Button>
      </div>

      {geoError && <p className="text-sm text-destructive text-center">{geoError}</p>}

      {pin && (
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="h-52">
            <Suspense
              fallback={
                <div className="h-full bg-card-elevated animate-pulse flex items-center justify-center text-muted-foreground text-sm">
                  Cargando mapa…
                </div>
              }
            >
              <LocationPickerMap
                lat={pin.lat}
                lng={pin.lng}
                onChange={(lat, lng) => setPin((p) => (p ? { ...p, lat, lng } : p))}
              />
            </Suspense>
          </div>
          <div className="flex items-center justify-between gap-4 px-4 py-3 bg-card border-t border-border">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-0.5">
                <Navigation className="size-3 shrink-0" />
                Punto de análisis · arrastra el pin para ajustar
              </div>
              <p className="text-sm font-mono text-foreground tabular-nums">
                {pin.lat.toFixed(5)}, {pin.lng.toFixed(5)}
              </p>
            </div>
            <Button
              size="lg"
              disabled={loading}
              onClick={() => onAnalyze(query, pin.lat, pin.lng, FIXED_RADIUS)}
              className="shrink-0 rounded-md bg-primary text-primary-foreground font-bold shadow-none hover:bg-primary/90"
            >
              {loading ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
              {loading ? "Analizando…" : "Analizar esta ubicación"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
