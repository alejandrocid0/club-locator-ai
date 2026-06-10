import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useState, useRef } from "react";
import { getSupabaseClient } from "~/lib/supabase.server";

export const Route = createFileRoute("/admin/pricing")({
  component: AdminPricing,
});

const PRICES_PROXY = "/functions/v1/playtomic-prices";

// Returns the date string (YYYY-MM-DD) of the next Tuesday
function nextTuesday(): string {
  const d = new Date();
  const day = d.getDay(); // 0=Sun, 2=Tue
  const daysUntilTuesday = (2 - day + 7) % 7 || 7;
  d.setDate(d.getDate() + daysUntilTuesday);
  return d.toISOString().slice(0, 10);
}

function parsePrice(priceStr: string): number | null {
  const match = priceStr.match(/[\d.]+/);
  return match ? parseFloat(match[0]) : null;
}

function extractTenantId(playtomicId: string): string {
  // playtomic_id format: "{tenant_id}_{index}" → extract tenant_id
  const parts = playtomicId.split("_");
  parts.pop();
  return parts.join("_");
}

const getUniqueTenants = createServerFn({ method: "POST" }).handler(async () => {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("courts")
    .select("playtomic_id")
    .eq("source", "playtomic")
    .not("playtomic_id", "is", null);

  if (error) throw new Error(error.message);

  const tenantIds = [...new Set((data ?? []).map((r) => extractTenantId(r.playtomic_id)))];
  return tenantIds;
});

const savePrices = createServerFn({ method: "POST" })
  .inputValidator((d: { tenantId: string; priceValley: number | null; pricePeak: number | null }) => d)
  .handler(async ({ data }) => {
    const supabase = getSupabaseClient();
    const update: Record<string, number> = {};
    if (data.priceValley !== null) update.price_valley = data.priceValley;
    if (data.pricePeak !== null) update.price_peak = data.pricePeak;
    if (Object.keys(update).length === 0) return { ok: true };

    const { error } = await supabase
      .from("courts")
      .update(update)
      .like("playtomic_id", `${data.tenantId}_%`);

    if (error) throw new Error(error.message);
    return { ok: true };
  });

async function fetchAvailability(proxyBase: string, key: string, tenantId: string, date: string) {
  const url = `${proxyBase}?tenant_id=${tenantId}&date=${date}`;
  const r = await fetch(url, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json() as Promise<{ resource_id: string; slots: { start_time: string; duration: number; price: string }[] }[]>;
}

function extractPriceAt(
  resources: { slots: { start_time: string; duration: number; price: string }[] }[],
  targetTime: string,
): number | null {
  for (const resource of resources) {
    // Prefer 90min slot, fall back to any duration at that time
    const slot90 = resource.slots.find((s) => s.start_time === targetTime && s.duration === 90);
    const slotAny = resource.slots.find((s) => s.start_time === targetTime);
    const slot = slot90 ?? slotAny;
    if (slot) return parsePrice(slot.price);
  }
  return null;
}

function AdminPricing() {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stats, setStats] = useState({ total: 0, done: 0, withValley: 0, withPeak: 0 });
  const [logs, setLogs] = useState<{ text: string; type: "info" | "ok" | "warn" | "err" }[]>([]);
  const [supabaseKey, setSupabaseKey] = useState("");
  const stopRef = useRef(false);

  function addLog(text: string, type: "info" | "ok" | "warn" | "err" = "info") {
    setLogs((prev) => [...prev, { text, type }]);
  }

  async function runPriceScrape() {
    if (!supabaseKey.trim()) {
      addLog("Introduce la service_role key antes de continuar.", "err");
      return;
    }

    setRunning(true);
    stopRef.current = false;
    setLogs([]);
    setProgress(0);

    const date = nextTuesday();
    addLog(`Fecha objetivo: ${date} (martes próximo)`, "info");

    let tenantIds: string[] = [];
    try {
      tenantIds = await getUniqueTenants();
    } catch (e: any) {
      addLog(`Error leyendo clubes de BD: ${e.message}`, "err");
      setRunning(false);
      return;
    }

    if (tenantIds.length === 0) {
      addLog("No se encontraron clubes de Playtomic en la BD. Ejecuta primero el seed de /admin/playtomic.", "err");
      setRunning(false);
      return;
    }

    addLog(`${tenantIds.length} clubes únicos encontrados en BD`, "info");
    setStats({ total: tenantIds.length, done: 0, withValley: 0, withPeak: 0 });

    const supabaseUrl = "https://xoaljtqznzvlhwwnxnjv.supabase.co";
    const proxyBase = `${supabaseUrl}${PRICES_PROXY}`;
    let done = 0, withValley = 0, withPeak = 0;

    for (let i = 0; i < tenantIds.length; i++) {
      if (stopRef.current) break;
      const tenantId = tenantIds[i];
      setProgress(Math.round((i / tenantIds.length) * 100));

      try {
        const resources = await fetchAvailability(proxyBase, supabaseKey, tenantId, date);
        const priceValley = extractPriceAt(resources, "11:00:00");
        const pricePeak = extractPriceAt(resources, "20:00:00");

        await savePrices({ data: { tenantId, priceValley, pricePeak } });

        done++;
        if (priceValley !== null) withValley++;
        if (pricePeak !== null) withPeak++;
        setStats({ total: tenantIds.length, done, withValley, withPeak });

        const valleStr = priceValley !== null ? `€${priceValley} valle` : "sin valle";
        const puntaStr = pricePeak !== null ? `€${pricePeak} punta` : "sin punta";
        addLog(`[${i + 1}/${tenantIds.length}] ${tenantId.slice(0, 8)}… → ${valleStr} / ${puntaStr}`, priceValley || pricePeak ? "ok" : "warn");

        await new Promise((r) => setTimeout(r, 150));
      } catch (e: any) {
        addLog(`WARN ${tenantId.slice(0, 8)}…: ${e.message}`, "warn");
      }
    }

    setProgress(100);
    addLog(`✅ Completado: ${done}/${tenantIds.length} clubes · ${withValley} con precio valle · ${withPeak} con precio punta`, "ok");
    setRunning(false);
  }

  const colorClass = { info: "text-blue-400", ok: "text-green-400", warn: "text-yellow-400", err: "text-red-400" };

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-8">
      <div className="w-full max-w-2xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Administración · Pricing</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Scraper de precios Playtomic — martes 11:00 (valle) y 20:00 (punta). Actualiza los
            precios de todos los clubes de la tabla courts.
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 space-y-2">
          <label className="text-xs uppercase tracking-wider text-muted-foreground">
            Supabase service_role key
          </label>
          <input
            type="password"
            value={supabaseKey}
            onChange={(e) => setSupabaseKey(e.target.value)}
            placeholder="eyJhbGciOiJIUzI1NiIs..."
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary"
            disabled={running}
          />
        </div>

        <div className="grid grid-cols-4 gap-3">
          {[
            { label: "Clubes", value: stats.total },
            { label: "Procesados", value: stats.done },
            { label: "Con valle", value: stats.withValley },
            { label: "Con punta", value: stats.withPeak },
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

        <button
          onClick={runPriceScrape}
          disabled={running}
          className="w-full rounded-xl bg-primary text-primary-foreground py-3 font-medium disabled:opacity-50 hover:bg-primary/90 transition-colors"
        >
          {running ? `Scrapeando precios... ${progress}%` : "Iniciar scrape de precios"}
        </button>

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
