import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { SearchBar } from "@/components/analyzer/SearchBar";
import { Report } from "@/components/analyzer/Report";
import { generateMockAnalysis, type AnalysisResult } from "@/lib/mock-analysis";
import { Activity } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "PadelRenting · Análisis estratégico de ubicaciones" },
      {
        name: "description",
        content: "Herramienta interna de inteligencia de mercado para evaluar ubicaciones de clubes de pádel en España.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);

  const handleAnalyze = (query: string, radius: number) => {
    setLoading(true);
    setTimeout(() => {
      setResult(generateMockAnalysis(query, radius));
      setLoading(false);
    }, 900);
  };

  return (
    <div className="min-h-screen bg-background text-foreground relative">
      {/* ambient glow */}
      <div
        className="pointer-events-none fixed inset-x-0 top-0 h-[600px] opacity-70"
        style={{ background: "var(--gradient-hero)" }}
      />

      <header className="relative border-b border-border/60 backdrop-blur bg-background/60">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="size-8 rounded-lg bg-gradient-to-br from-primary to-primary-glow grid place-items-center text-primary-foreground">
              <Activity className="size-4" />
            </div>
            <span className="font-semibold tracking-tight">PadelRenting</span>
            <span className="text-muted-foreground text-sm hidden sm:inline">· Location Intelligence</span>
          </div>
          <div className="text-xs text-muted-foreground hidden md:flex items-center gap-2">
            <span className="size-1.5 rounded-full bg-success animate-pulse" />
            Prototipo · datos simulados
          </div>
        </div>
      </header>

      <main className="relative max-w-7xl mx-auto px-6 pt-16 pb-24">
        <div className="text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.25em] text-primary/80 mb-5">
            <span className="size-1.5 rounded-full bg-primary" />
            Expansión estratégica
          </div>
          <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text text-transparent">
            Expansión estratégica de PadelRenting
          </h1>
          <p className="mt-4 text-lg text-muted-foreground">
            Análisis experto de ubicaciones para clubes de pádel. Introduce una dirección o URL de Google Maps y obtén
            un informe de mercado en segundos.
          </p>
        </div>

        <div className="mt-10">
          <SearchBar onAnalyze={handleAnalyze} loading={loading} />
        </div>

        <div className="mt-16">
          {loading && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-pulse">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-28 rounded-2xl border border-border bg-card-elevated/50" />
              ))}
            </div>
          )}
          {!loading && result && <Report data={result} />}
          {!loading && !result && (
            <div className="text-center text-sm text-muted-foreground mt-8">
              Empieza analizando una ubicación. Ejemplos: <em>“Pozuelo de Alarcón”</em>, <em>“Marbella centro”</em>,
              <em> “Av. Diagonal, Barcelona”</em>.
            </div>
          )}
        </div>

        <footer className="mt-24 pt-8 border-t border-border/60 text-xs text-muted-foreground flex flex-wrap items-center justify-between gap-2">
          <div>© PadelRenting · Location Intelligence</div>
          <div>Fuentes preparadas para integración: INE · Google Maps · Playtomic · Catastro · PostGIS</div>
        </footer>
      </main>
    </div>
  );
}
