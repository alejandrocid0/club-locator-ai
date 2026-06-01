import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef } from "react";

export const Route = createFileRoute("/admin/playtomic")({
  component: AdminPlaytomic,
});

const SUPABASE_URL = "https://xoaljtqznzvlhwwnxnjv.supabase.co";
const SUPABASE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhvYWxqdHF6bnp2bGh3d254bmp2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDA0NjA5NSwiZXhwIjoyMDk1NjIyMDk1fQ.XHJxw0zMFTYmcnrQHXurv_PaXZ0YAmojB7FqFZzV-WM";
const PLAYTOMIC_API = "https://api.playtomic.io/v1/tenants";

const GRID: [number, number][] = [];
for (let lat = 36.0; lat <= 44.0; lat += 0.5) {
  for (let lng = -9.5; lng <= 4.5; lng += 0.7) {
    GRID.push([+lat.toFixed(2), +lng.toFixed(2)]);
  }
}
for (let lat = 27.5; lat <= 29.5; lat += 0.5) {
  for (let lng = -18.2; lng <= -13.0; lng += 0.7) {
    GRID.push([+lat.toFixed(2), +lng.toFixed(2)]);
  }
}

async function fetchTenants(lat: number, lng: number) {
  const url = `${PLAYTOMIC_API}?sport_id=PADEL&coordinate=${lat},${lng}&radius=40000&size=100&playtomic_status=ACTIVE,INACTIVE`;
  const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json() as Promise<any[]>;
}

async function supabaseUpsert(rows: object[]) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/courts`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      Prefer: "resolution=merge-duplicates",
    },
    body: JSON.stringify(rows),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`Supabase ${r.status}: ${t.slice(0, 200)}`);
  }
}

function parseTenant(tenant: any) {
  const coord = tenant.address?.coordinate ?? {};
  const lat = coord.lat;
  const lng = coord.lon;
  if (!lat || !lng) return [];

  const resources = (tenant.resources ?? []).filter(
    (r: any) => r.sport_id === "PADEL" && r.is_active,
  );

  if (resources.length === 0) {
    return [
      {
        osm_id: null,
        playtomic_id: tenant.tenant_id,
        name: "Pista 1",
        club_name: tenant.tenant_name,
        lat,
        lng,
        is_indoor: false,
        source: "playtomic",
        verified: true,
      },
    ];
  }

  return resources.map((res: any, i: number) => ({
    osm_id: null,
    playtomic_id: `${tenant.tenant_id}_${i}`,
    name: res.name ?? `Pista ${i + 1}`,
    club_name: tenant.tenant_name,
    lat,
    lng,
    is_indoor: res.properties?.resource_type === "indoor",
    source: "playtomic",
    verified: true,
  }));
}

function AdminPlaytomic() {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stats, setStats] = useState({ clubs: 0, courts: 0, indoor: 0, inserted: 0 });
  const [logs, setLogs] = useState<{ text: string; type: "info" | "ok" | "warn" | "err" }[]>([]);
  const stopRef = useRef(false);

  function addLog(text: string, type: "info" | "ok" | "warn" | "err" = "info") {
    setLogs((prev) => [...prev, { text, type }]);
  }

  async function runSeed() {
    setRunning(true);
    stopRef.current = false;
    setLogs([]);
    setProgress(0);
    setStats({ clubs: 0, courts: 0, indoor: 0, inserted: 0 });

    const seen = new Set<string>();
    let rows: object[] = [];
    let clubs = 0, courts = 0, indoor = 0, inserted = 0;
    const BATCH = 200;

    addLog(`Grid: ${GRID.length} puntos, radio 40km`, "info");

    for (let i = 0; i < GRID.length; i++) {
      if (stopRef.current) break;
      const [lat, lng] = GRID[i];
      setProgress(Math.round((i / GRID.length) * 100));

      try {
        const tenants = await fetchTenants(lat, lng);
        let newInBatch = 0;

        for (const tenant of tenants) {
          if (seen.has(tenant.tenant_id)) continue;
          seen.add(tenant.tenant_id);
          newInBatch++;
          clubs++;

          const parsed = parseTenant(tenant);
          courts += parsed.length;
          indoor += parsed.filter((c: any) => c.is_indoor).length;
          rows.push(...parsed);
        }

        if (newInBatch > 0) {
          addLog(`[${i + 1}/${GRID.length}] (${lat},${lng}) → ${newInBatch} clubes nuevos (total: ${clubs})`);
          setStats({ clubs, courts, indoor, inserted });
        }

        if (rows.length >= BATCH) {
          await supabaseUpsert(rows);
          inserted += rows.length;
          rows = [];
          setStats({ clubs, courts, indoor, inserted });
        }

        await new Promise((r) => setTimeout(r, 80));
      } catch (e: any) {
        addLog(`WARN (${lat},${lng}): ${e.message}`, "warn");
      }
    }

    if (rows.length > 0) {
      await supabaseUpsert(rows);
      inserted += rows.length;
    }

    setProgress(100);
    setStats({ clubs, courts, indoor, inserted });
    addLog(`✅ Completado: ${clubs} clubes, ${courts} pistas (${indoor} indoor, ${courts - indoor} outdoor)`, "ok");
    addLog(`   ${inserted} filas insertadas en Supabase`, "ok");
    setRunning(false);
  }

  async function runClear() {
    if (!confirm("¿Borrar todos los datos de Playtomic de la tabla courts?")) return;
    const r = await fetch(`${SUPABASE_URL}/rest/v1/courts?source=eq.playtomic`, {
      method: "DELETE",
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    });
    addLog(r.ok ? "✅ Datos Playtomic eliminados" : `❌ Error: ${r.status}`, r.ok ? "ok" : "err");
  }

  const colorClass = { info: "text-blue-400", ok: "text-green-400", warn: "text-yellow-400", err: "text-red-400" };

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-8">
      <div className="w-full max-w-2xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Administración · Playtomic</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Descarga todos los clubes de pádel de España desde Playtomic y los carga en Supabase.
          </p>
        </div>

        <div className="grid grid-cols-4 gap-3">
          {[
            { label: "Clubes", value: stats.clubs },
            { label: "Pistas", value: stats.courts },
            { label: "Indoor", value: stats.indoor },
            { label: "Insertadas", value: stats.inserted },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-border bg-card p-4 text-center">
              <div className="text-2xl font-bold text-blue-400">{s.value.toLocaleString("es-ES")}</div>
              <div className="text-xs text-muted-foreground mt-1">{s.label}</div>
            </div>
          ))}
        </div>

        {running && (
          <div className="w-full bg-muted rounded-full h-1.5">
            <div className="bg-blue-500 h-1.5 rounded-full transition-all" style={{ width: `${progress}%` }} />
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={runSeed}
            disabled={running}
            className="flex-1 rounded-xl bg-primary text-primary-foreground py-3 font-medium disabled:opacity-50 hover:bg-primary/90 transition-colors"
          >
            {running ? `Cargando... ${progress}%` : "Cargar clubes de Playtomic"}
          </button>
          <button
            onClick={runClear}
            disabled={running}
            className="rounded-xl bg-destructive text-destructive-foreground px-6 py-3 font-medium disabled:opacity-50 hover:bg-destructive/90 transition-colors"
          >
            Borrar datos
          </button>
        </div>

        {logs.length > 0 && (
          <div className="rounded-xl border border-border bg-card p-4 text-xs font-mono space-y-0.5 max-h-80 overflow-y-auto">
            {logs.map((log, i) => (
              <div key={i} className={colorClass[log.type]}>
                {log.text}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
