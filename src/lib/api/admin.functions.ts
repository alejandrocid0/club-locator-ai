import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSupabaseClient } from "@/lib/supabase.server";

const CourtSchema = z.object({
  osm_id: z.string(),
  name: z.string().nullable(),
  lat: z.number(),
  lng: z.number(),
  is_indoor: z.boolean(),
  source: z.string(),
  verified: z.boolean(),
});

export const insertCourtsBatch = createServerFn({ method: "POST" })
  .inputValidator(z.object({ courts: z.array(CourtSchema) }))
  .handler(async ({ data }) => {
    const supabase = getSupabaseClient();
    const { error } = await supabase
      .from("courts")
      .upsert(data.courts, { onConflict: "osm_id", ignoreDuplicates: true });
    if (error) throw new Error(error.message);
    return { inserted: data.courts.length };
  });
