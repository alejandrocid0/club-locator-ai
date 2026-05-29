import { useState } from "react";
import { Search, MapPin, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const RADII = [5, 10, 15];

export function SearchBar({
  onAnalyze,
  loading,
}: {
  onAnalyze: (q: string, r: number) => void;
  loading: boolean;
}) {
  const [query, setQuery] = useState("");
  const [radius, setRadius] = useState(10);

  return (
    <div className="w-full max-w-3xl mx-auto">
      <div className="relative group">
        <div className="relative flex items-center gap-2 rounded-2xl border border-border bg-card p-2 shadow-[var(--shadow-elegant)] focus-within:border-primary/50 transition-colors">
          <div className="pl-3 text-muted-foreground">
            <MapPin className="size-5" />
          </div>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && query && onAnalyze(query, radius)}
            placeholder="Dirección o URL de Google Maps"
            className="flex-1 bg-transparent outline-none text-foreground placeholder:text-muted-foreground py-3 text-base"
          />
          <Button
            size="lg"
            disabled={!query || loading}
            onClick={() => onAnalyze(query, radius)}
            className="rounded-xl bg-primary text-primary-foreground font-medium hover:bg-primary/90"
          >
            {loading ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
            <span className="ml-2">Analizar</span>
          </Button>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-center gap-2">
        <span className="text-xs uppercase tracking-widest text-muted-foreground mr-2">Radio</span>
        {RADII.map((r) => (
          <button
            key={r}
            onClick={() => setRadius(r)}
            className={`px-4 py-1.5 rounded-full text-sm border transition-all ${
              radius === r
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-card text-muted-foreground hover:text-foreground"
            }`}
          >
            {r} km
          </button>
        ))}
      </div>
    </div>
  );
}