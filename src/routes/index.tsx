import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { LocationPicker } from "@/components/analyzer/LocationPicker";
import { Report } from "@/components/analyzer/Report";
import { analyzeLocation } from "@/lib/api/analyze.functions";
import { generateMockAnalysis, type AnalysisResult } from "@/lib/mock-analysis";
import logo from "@/assets/padelrenting-logo.png";

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
  const [error, setError] = useState<string | null>(null);
  const [analyzedAddress, setAnalyzedAddress] = useState<string | null>(null);

  const handleAnalyze = async (query: string, lat: number, lng: number, radius: number) => {
    setLoading(true);
    setError(null);
    setAnalyzedAddress(query);

    try {
      const data = await analyzeLocation({ data: { query, radius, lat, lng } });
      setResult(data as AnalysisResult);
    } catch (err) {
      console.warn("Backend not available, using mock data:", err);
      setResult(generateMockAnalysis(query, radius));
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setResult(null);
    setAnalyzedAddress(null);
    setError(null);
  };

  const showReport = loading || result;

  return (
    <div className="min-h-screen bg-background text-foreground relative">
      <header className="relative border-b border-border bg-background">
        <div className="max-w-7xl mx-auto px-6 py-5 flex items-center justify-between">
          <img
            src={logo}
            alt="PadelRenting"
            className="h-7 w-auto cursor-pointer"
            onClick={handleReset}
          />
          {showReport && (
            <button
              onClick={handleReset}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors underline underline-offset-4"
            >
              Nueva búsqueda
            </button>
          )}
        </div>
      </header>

      <main className="relative max-w-7xl mx-auto px-6 pt-12 pb-24">
        {!showReport ? (
          <>
            <div className="text-center max-w-2xl mx-auto">
              <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-foreground">
                Análisis de ubicaciones
              </h1>
            </div>
            <div className="mt-10">
              <LocationPicker onAnalyze={handleAnalyze} loading={loading} />
            </div>
            {error && (
              <div className="mt-6 text-center text-sm text-destructive">{error}</div>
            )}
          </>
        ) : (
          <>
            <div className="mb-8">
              <p className="text-xs uppercase tracking-widest font-bold text-primary mb-1">
                Informe de análisis
              </p>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
                {analyzedAddress}
              </h1>
            </div>

            {loading && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-pulse">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="h-28 rounded-xl border border-border bg-card/50" />
                ))}
              </div>
            )}
            {!loading && result && <Report data={result} />}
          </>
        )}

        <footer className="mt-24 pt-8 border-t border-border text-xs text-muted-foreground text-center">
          © PadelRenting
        </footer>
      </main>
    </div>
  );
}
