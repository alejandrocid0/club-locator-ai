import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/start";
import { useState, useRef } from "react";
import { getSupabaseClient } from "~/lib/supabase.server";

export const Route = createFileRoute("/admin/playtomic")({
  component: AdminPlaytomic,
});

const PROXY_PATH = "/functions/v1/playtomic-proxy";

const fetchPlaytomicTenants = createServerFn({ method: "GET" })
  .validator((d: { lat: number; lng: number }) => d)
  .handler(async ({ data }) => {
    const url = process.env["DB_URL"];
    const key = process.env["DB_SERVICE_KEY"];
    if (!url || !key) throw new Error("Missing DB_URL or DB_SERVICE_KEY");

    const proxyUrl = `${url}${PROXY_PATH}?lat=${data.lat}&lng=${data.lng}&radius=40000`;
    const r = await fetch(proxyUrl, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json() as Promise<any[]>;
  });

const upsertCourts = createServerFn({ method: "POST" })
  .validator((d: object[]) => d)
  .handler(async ({ data }) => {
    const supabase = getSupabaseClient();
    const { error } = await supabase
      .from("courts")
      .upsert(data as any[], { onConflict: "playtomic_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const clearPlaytomicCourts = createServerFn({ method: "POST" })
  .handler(async () => {
    const supabase = getSupabaseClient();
    const { error } = await supabase
      .from("courts")
      .delete()
      .eq("source", "playtomic");
    if (error) throw new Error(error.message);
    return { ok: true };
  });

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

function parseTenant(tenant: any) {
  const coord = tenant.address?.coordinate ?? {};
  const lat = coord.lat;
  const lng = coord.lon;
  if (!lat || !lng) return [];

  const resources = (tenant.resources ?? []).filter(
    (r: any) => r.sport_id === "PADEL" && r.is_active,
  );

  const base = {
    osm_id: null,
    club_name: tenant.tenant_name,
    lat,
    lng,
    source: "playtomic",
    verified: true,
  };

  if (resources.length === 0) {
    return [{ ...base, playtomic_id: tenant.tenant_id, name: "Pista 1", is_indoor: false }];
  }

  return resources.map((res: any, i: number) => ({
    ...base,
    playtomic_id: `${tenant.tenant_id}_${i}`,
    name: res.name ?? `Pista ${i + 1}`,
    is_indoor: res.properties?.resource_type === "indoor",
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
        const tenants = await fetchPlaytomicTenants({ data: { lat, lng } });
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
          await upsertCourts({ data: rows });
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
      await upsertCourts({ data: rows });
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
    try {
      await clearPlaytomicCourts();
      addLog("✅ Datos Playtomic eliminados", "ok");
    } catch (e: any) {
      addLog(`❌ Error: ${e.message}`, "err");
    }
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
