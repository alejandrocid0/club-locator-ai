-- ============================================================
-- MIGRACIÓN 001 — Ejecutar en Supabase → SQL Editor
-- ============================================================

-- 1. Simplificar census_sections (eliminar columnas no necesarias)
ALTER TABLE census_sections DROP COLUMN IF EXISTS avg_income;
ALTER TABLE census_sections DROP COLUMN IF EXISTS avg_age;
ALTER TABLE census_sections DROP COLUMN IF EXISTS households;

-- 2. Nueva tabla courts (pistas individuales de pádel)
CREATE TABLE IF NOT EXISTS courts (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    osm_id      TEXT UNIQUE,
    name        TEXT,
    lat         FLOAT NOT NULL,
    lng         FLOAT NOT NULL,
    location    GEOMETRY(POINT, 4326),
    is_indoor   BOOLEAN DEFAULT false,
    source      TEXT DEFAULT 'osm',
    verified    BOOLEAN DEFAULT false,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_courts_location ON courts USING GIST(location);

-- Trigger para sincronizar geometry desde lat/lng
CREATE OR REPLACE FUNCTION sync_court_location()
RETURNS TRIGGER AS $$
BEGIN
    NEW.location = ST_SetSRID(ST_MakePoint(NEW.lng, NEW.lat), 4326);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_sync_court_location
    BEFORE INSERT OR UPDATE ON courts
    FOR EACH ROW EXECUTE FUNCTION sync_court_location();

-- 3. Función PostGIS: pistas en radio
CREATE OR REPLACE FUNCTION courts_in_radius(
    center_lat FLOAT,
    center_lng FLOAT,
    radius_meters FLOAT
)
RETURNS TABLE (
    id          UUID,
    name        TEXT,
    is_indoor   BOOLEAN,
    distance_m  FLOAT
)
LANGUAGE sql
STABLE
AS $$
    SELECT
        c.id,
        c.name,
        c.is_indoor,
        ST_Distance(
            c.location::geography,
            ST_SetSRID(ST_MakePoint(center_lng, center_lat), 4326)::geography
        ) AS distance_m
    FROM courts c
    WHERE ST_DWithin(
        c.location::geography,
        ST_SetSRID(ST_MakePoint(center_lng, center_lat), 4326)::geography,
        radius_meters
    )
    ORDER BY distance_m ASC;
$$;

-- 4. Actualizar función demographics (eliminar avg_income, avg_age)
CREATE OR REPLACE FUNCTION demographics_in_radius(
    center_lat FLOAT,
    center_lng FLOAT,
    radius_meters FLOAT
)
RETURNS TABLE (
    population  BIGINT,
    area_km2    FLOAT
)
LANGUAGE sql
STABLE
AS $$
    SELECT
        SUM(
            cs.population * (
                ST_Area(ST_Intersection(
                    cs.geometry,
                    ST_Buffer(ST_SetSRID(ST_MakePoint(center_lng, center_lat), 4326)::geography, radius_meters)::geometry
                )) /
                NULLIF(ST_Area(cs.geometry), 0)
            )
        )::BIGINT AS population,
        SUM(cs.area_km2) AS area_km2
    FROM census_sections cs
    WHERE ST_DWithin(
        cs.geometry::geography,
        ST_SetSRID(ST_MakePoint(center_lng, center_lat), 4326)::geography,
        radius_meters
    );
$$;
