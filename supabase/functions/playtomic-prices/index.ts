import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  try {
    const url = new URL(req.url);
    const tenantId = url.searchParams.get("tenant_id");
    const date = url.searchParams.get("date");

    if (!tenantId || !date) {
      return new Response(JSON.stringify({ error: "tenant_id and date required" }), {
        status: 400,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const playtomicUrl =
      `https://playtomic.com/api/clubs/availability?tenant_id=${tenantId}&date=${date}&sport_id=PADEL`;

    const resp = await fetch(playtomicUrl, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(14000),
    });

    if (!resp.ok) {
      return new Response(JSON.stringify({ error: `Playtomic ${resp.status}` }), {
        status: resp.status,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const data = await resp.json();
    return new Response(JSON.stringify(data), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
