-- ============================================================
-- MIGRACIÓN 002 — Ejecutar en Supabase → SQL Editor
-- ============================================================

-- Añade columnas de precio por pista scraped desde Playtomic
-- price_valley: precio slot 90min un martes a las 11:00 (hora valle)
-- price_peak:   precio slot 90min un martes a las 20:00 (hora punta)
ALTER TABLE courts ADD COLUMN IF NOT EXISTS price_valley FLOAT;
ALTER TABLE courts ADD COLUMN IF NOT EXISTS price_peak   FLOAT;
