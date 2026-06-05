import { useState } from "react";
import { Search, MapPin, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const FIXED_RADIUS = 10;

export function SearchBar({
  onAnalyze,
  loading,
}: {
  onAnalyze: (q: string, r: number) => void;
  loading: boolean;
}) {
  const [query, setQuery] = useState("");

  return (
    <div className="w-full max-w-3xl mx-auto">
      <div className="relative group">
        <div className="relative flex items-center gap-2 rounded-lg border border-border bg-card p-2 focus-within:border-primary transition-colors">
          <div className="pl-3 text-muted-foreground">
            <MapPin className="size-5" />
          </div>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && query && onAnalyze(query, FIXED_RADIUS)}
            placeholder="Dirección o URL de Google Maps"
            className="flex-1 bg-transparent outline-none text-foreground placeholder:text-muted-foreground py-3 text-base"
          />
          <Button
            size="lg"
            disabled={!query || loading}
            onClick={() => onAnalyze(query, FIXED_RADIUS)}
            className="rounded-md bg-primary text-primary-foreground font-bold shadow-none hover:bg-primary/90"
          >
            {loading ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
            <span className="ml-2">Analizar</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
