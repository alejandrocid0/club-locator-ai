import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

export const Route = createFileRoute("/admin/seed")({
  component: AdminSeed,
});

const SUPABASE_URL = "https://xoaljtqznzvlhwwnxnjv.supabase.co";
const SUPABASE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhvYWxqdHF6bnp2bGh3d254bmp2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDA0NjA5NSwiZXhwIjoyMDk1NjIyMDk1fQ.XHJxw0zMFTYmcnrQHXurv_PaXZ0YAmojB7FqFZzV-WM";

const OVERPASS_MIRRORS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.openstreetmap.ru/api/interpreter",
];

const SPAIN_BBOX = "27.6,-18.2,43.8,4.4";

const QUERY = `[out:json][timeout:180];
(
  node["sport"="padel"](${SPAIN_BBOX});
  way["sport"="padel"](${SPAIN_BBOX});
  node["leisure"="pitch"]["sport"="padel"](${SPAIN_BBOX});
  way["leisure"="pitch"]["sport"="padel"](${SPAIN_BBOX});
  node["leisure"="sports_centre"]["sport"="padel"](${SPAIN_BBOX});
  way["leisure"="sports_centre"]["sport"="padel"](${SPAIN_BBOX});
);
out center tags;`;

function isIndoor(tags: Record<string, string>): boolean {
  return (
    tags["indoor"] === "yes" ||
    tags["covered"] === "yes" ||
    ["yes", "sports_hall", "sport"].includes(tags["building"] ?? "")
  );
}

async function supabaseUpsert(batch: object[]) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/courts`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      Prefer: "resolution=ignore-duplicates",
    },
    body: JSON.stringify(batch),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase ${res.status}: ${text.slice(0, 200)}`);
  }
}

function AdminSeed() {
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [logs, setLogs] = useState<{ text: string; type: "info" | "ok" | "err" | "normal" }[]>([]);

  function addLog(text: string, type: "info" | "ok" | "err" | "normal" = "normal") {
    setLogs((prev) => [...prev, { text, type }]);
  }

  const handleSeed = async () => {
    setStatus("loading");
    setLogs([]);

    try {
      addLog("Consultando Overpass API desde el navegador (puede tardar 1-3 min)...", "info");

      let elements: any[] = [];
      let fetched = false;

      for (const mirror of OVERPASS_MIRRORS) {
        try {
          addLog(`Probando ${mirror}...`);
          const res = await fetch(mirror, {
            method: "POST",
            body: "data=" + encodeURIComponent(QUERY),
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            signal: AbortSignal.timeout(200_000),
          });
          if (!res.ok) {
            addLog(`  → HTTP ${res.status}, probando siguiente...`);
            continue;
          }
          const json = (await res.json()) as { elements: any[] };
          elements = json.elements ?? [];
          addLog(`  → OK: ${elements.length} elementos recibidos`, "ok");
          fetched = true;
          break;
        } catch (e: any) {
          addLog(`  → Error: ${e.message}`);
        }
      }

      if (!fetched) throw new Error("Todos los mirrors de Overpass fallaron.");

      const courts = elements
        .map((el: any) => {
          const tags = el.tags ?? {};
          const lat = el.lat ?? el.center?.lat;
          const lng = el.lon ?? el.center?.lon;
          if (!lat || !lng) return null;
          return {
            osm_id: `${el.type}_${el.id}`,
            name: (tags.name ?? tags.operator ?? null) as string | null,
            lat: lat as number,
            lng: lng as number,
            is_indoor: isIndoor(tags),
            source: "osm",
            verified: false,
          };
        })
        .filter((c): c is NonNullable<typeof c> => c !== null);

      const indoor = courts.filter((c) => c.is_indoor).length;
      const outdoor = courts.length - indoor;
      addLog(`${courts.length} pistas válidas (${indoor} indoor, ${outdoor} outdoor)`, "info");
      addLog("Insertando en Supabase directamente desde el navegador...", "info");

      const batchSize = 200;
      let inserted = 0;
      for (let i = 0; i < courts.length; i += batchSize) {
        const batch = courts.slice(i, i + batchSize);
        await supabaseUpsert(batch);
        inserted += batch.length;
        addLog(`Batch ${Math.floor(i / batchSize) + 1}: ${inserted}/${courts.length} procesadas`);
      }

      addLog(`✅ ${inserted} pistas cargadas (${indoor} indoor, ${outdoor} outdoor)`, "ok");
      setStatus("done");
    } catch (err: any) {
      addLog(`Error: ${err.message}`, "err");
      setStatus("error");
    }
  };

  const colorClass = {
    info: "text-blue-400",
    ok: "text-green-400",
    err: "text-red-400",
    normal: "text-muted-foreground",
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-8">
      <div className="w-full max-w-lg space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Administración · Carga de datos</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Uso interno. Ejecutar una sola vez.
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
          <div>
            <h2 className="font-medium">Pistas de pádel — OpenStreetMap</h2>
            <p className="text-sm text-muted-foreground mt-1">
              El navegador descarga las pistas de OSM y las guarda directamente en Supabase.
              Tarda 2-4 minutos.
            </p>
          </div>

          <button
            onClick={handleSeed}
            disabled={status === "loading"}
            className="w-full rounded-xl bg-primary text-primary-foreground py-3 font-medium disabled:opacity-50 hover:bg-primary/90 transition-colors"
          >
            {status === "loading" ? "Cargando..." : "Cargar pistas desde OSM"}
          </button>

          {logs.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-4 text-xs font-mono space-y-0.5 max-h-72 overflow-y-auto">
              {logs.map((log, i) => (
                <div key={i} className={colorClass[log.type]}>
                  {log.text}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
