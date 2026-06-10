-- ============================================================
-- MIGRACIÓN 002 — Ejecutar en Supabase → SQL Editor
-- ============================================================

-- 1. Añadir columnas de precio a la tabla courts
ALTER TABLE courts ADD COLUMN IF NOT EXISTS price_valley FLOAT;
ALTER TABLE courts ADD COLUMN IF NOT EXISTS price_peak   FLOAT;

-- 2. Actualizar courts_in_radius para devolver precios por club
CREATE OR REPLACE FUNCTION courts_in_radius(
    center_lat FLOAT,
    center_lng FLOAT,
    radius_meters FLOAT
)
RETURNS TABLE (
    club_name    TEXT,
    is_indoor    BOOLEAN,
    distance_m   FLOAT,
    court_count  BIGINT,
    lat          FLOAT,
    lng          FLOAT,
    price_valley FLOAT,
    price_peak   FLOAT
)
LANGUAGE sql
STABLE
AS $$
    SELECT
        c.club_name,
        bool_or(c.is_indoor)                        AS is_indoor,
        ST_Distance(
            MIN(c.location)::geography,
            ST_SetSRID(ST_MakePoint(center_lng, center_lat), 4326)::geography
        )                                            AS distance_m,
        COUNT(*)                                     AS court_count,
        c.lat,
        c.lng,
        MIN(c.price_valley)                          AS price_valley,
        MIN(c.price_peak)                            AS price_peak
    FROM courts c
    WHERE ST_DWithin(
        c.location::geography,
        ST_SetSRID(ST_MakePoint(center_lng, center_lat), 4326)::geography,
        radius_meters
    )
    GROUP BY c.club_name, c.lat, c.lng
    ORDER BY distance_m ASC;
$$;
