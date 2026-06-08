-- ============================================================
-- Funciones RPC de Supabase (ejecutar después del schema.sql)
-- Supabase → SQL Editor → New query
-- ============================================================

-- Función: clubes dentro de un radio geográfico
CREATE OR REPLACE FUNCTION clubs_in_radius(
    center_lat FLOAT,
    center_lng FLOAT,
    radius_meters FLOAT
)
RETURNS TABLE (
    id UUID,
    name TEXT,
    city TEXT,
    total_courts INTEGER,
    indoor_courts INTEGER,
    outdoor_courts INTEGER,
    has_indoor BOOLEAN,
    price_valley FLOAT,
    price_peak FLOAT,
    rating FLOAT,
    distance_m FLOAT
)
LANGUAGE sql
STABLE
AS $$
    SELECT
        c.id,
        c.name,
        c.city,
        c.total_courts,
        c.indoor_courts,
        c.outdoor_courts,
        c.has_indoor,
        c.price_valley,
        c.price_peak,
        c.rating,
        ST_Distance(
            c.location::geography,
            ST_SetSRID(ST_MakePoint(center_lng, center_lat), 4326)::geography
        ) AS distance_m
    FROM clubs c
    WHERE
        c.active = true
        AND ST_DWithin(
            c.location::geography,
            ST_SetSRID(ST_MakePoint(center_lng, center_lat), 4326)::geography,
            radius_meters
        )
    ORDER BY distance_m ASC;
$$;

-- Función: demografía ponderada dentro de un radio (requiere datos INE cargados)
CREATE OR REPLACE FUNCTION demographics_in_radius(
    center_lat FLOAT,
    center_lng FLOAT,
    radius_meters FLOAT
)
RETURNS TABLE (
    population BIGINT,
    area_km2 FLOAT
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
