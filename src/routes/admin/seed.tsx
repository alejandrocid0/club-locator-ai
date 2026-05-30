import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { seedCourtsFromOSM } from "@/lib/api/admin.functions";

export const Route = createFileRoute("/admin/seed")({
  component: AdminSeed,
});

function AdminSeed() {
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [result, setResult] = useState<string>("");

  const handleSeedCourts = async () => {
    setStatus("loading");
    setResult("Consultando OpenStreetMap (puede tardar 1-3 minutos)...");
    try {
      const data = await seedCourtsFromOSM();
      setResult(data.message);
      setStatus("done");
    } catch (err: any) {
      setResult(`Error: ${err.message}`);
      setStatus("error");
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-8">
      <div className="w-full max-w-lg space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Administración · Carga de datos</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Uso interno. Ejecutar una sola vez por tipo de dato.
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
          <div>
            <h2 className="font-medium">Pistas de pádel — OpenStreetMap</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Descarga todas las pistas de pádel de España registradas en OSM y las guarda en
              Supabase. Tarda entre 1 y 3 minutos.
            </p>
          </div>

          <button
            onClick={handleSeedCourts}
            disabled={status === "loading"}
            className="w-full rounded-xl bg-primary text-primary-foreground py-3 font-medium disabled:opacity-50 hover:bg-primary/90 transition-colors"
          >
            {status === "loading" ? "Cargando..." : "Cargar pistas desde OSM"}
          </button>

          {result && (
            <div
              className={`rounded-xl border p-4 text-sm ${
                status === "done"
                  ? "border-green-500/30 bg-green-500/10 text-green-700"
                  : status === "error"
                    ? "border-red-500/30 bg-red-500/10 text-red-700"
                    : "border-border bg-card-elevated text-muted-foreground"
              }`}
            >
              {result}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
