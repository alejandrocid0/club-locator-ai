-- ============================================================
-- CLUB LOCATOR AI — Schema PostgreSQL + PostGIS
-- Ejecutar en Supabase → SQL Editor → New query
-- ============================================================

-- Habilitar extensión GIS (obligatorio)
CREATE EXTENSION IF NOT EXISTS postgis;

-- ============================================================
-- TABLA: census_sections
-- Secciones censales INE con geometrías y datos demográficos
-- ============================================================
CREATE TABLE IF NOT EXISTS census_sections (
    id              SERIAL PRIMARY KEY,
    cusec           TEXT UNIQUE NOT NULL,       -- Código único INE (ej: 2807901001)
    municipality    TEXT NOT NULL,              -- Nombre municipio
    municipality_code TEXT,                     -- Código INE municipio
    province        TEXT NOT NULL,              -- Nombre provincia
    province_code   TEXT,                       -- Código INE provincia
    population      INTEGER DEFAULT 0,          -- Población total
    area_km2        FLOAT,                      -- Área en km²
    geometry        GEOMETRY(MULTIPOLYGON, 4326),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_census_geom
    ON census_sections USING GIST(geometry);

CREATE INDEX IF NOT EXISTS idx_census_province
    ON census_sections(province_code);

CREATE INDEX IF NOT EXISTS idx_census_municipality
    ON census_sections(municipality_code);

-- ============================================================
-- TABLA: clubs
-- Base nacional de clubes de pádel
-- ============================================================
CREATE TABLE IF NOT EXISTS clubs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT NOT NULL,
    address         TEXT,
    city            TEXT,
    province        TEXT,
    postal_code     TEXT,
    lat             FLOAT NOT NULL,
    lng             FLOAT NOT NULL,
    location        GEOMETRY(POINT, 4326),
    total_courts    INTEGER DEFAULT 0,
    indoor_courts   INTEGER DEFAULT 0,
    outdoor_courts  INTEGER DEFAULT 0,
    has_indoor      BOOLEAN DEFAULT false,
    price_valley    FLOAT,                      -- Precio hora valle (€)
    price_peak      FLOAT,                      -- Precio hora punta (€)
    rating          FLOAT,                      -- Rating Google/OSM (0-5)
    reviews_count   INTEGER DEFAULT 0,
    phone           TEXT,
    website         TEXT,
    opening_hours   TEXT,
    source          TEXT DEFAULT 'manual',      -- 'osm' | 'manual' | 'google_places'
    osm_id          TEXT,                       -- ID en OpenStreetMap
    verified        BOOLEAN DEFAULT false,
    active          BOOLEAN DEFAULT true,
    notes           TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clubs_location
    ON clubs USING GIST(location);

CREATE INDEX IF NOT EXISTS idx_clubs_province
    ON clubs(province);

CREATE INDEX IF NOT EXISTS idx_clubs_city
    ON clubs(city);

-- Trigger para mantener geometry sincronizada con lat/lng
CREATE OR REPLACE FUNCTION sync_club_location()
RETURNS TRIGGER AS $$
BEGIN
    NEW.location = ST_SetSRID(ST_MakePoint(NEW.lng, NEW.lat), 4326);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_sync_club_location
    BEFORE INSERT OR UPDATE ON clubs
    FOR EACH ROW EXECUTE FUNCTION sync_club_location();

-- ============================================================
-- TABLA: benchmarks
-- Benchmarks nacionales, provinciales y por ciudad
-- ============================================================
CREATE TABLE IF NOT EXISTS benchmarks (
    id              SERIAL PRIMARY KEY,
    scope           TEXT NOT NULL,              -- 'national' | 'province' | 'city'
    scope_name      TEXT NOT NULL,              -- 'España' | 'Madrid' | 'Barcelona'
    scope_code      TEXT,                       -- Código INE (opcional)
    metric          TEXT NOT NULL,              -- Nombre del KPI
    value           FLOAT,
    unit            TEXT,                       -- 'ratio' | 'count' | 'eur' | 'pct'
    year            INTEGER DEFAULT 2024,
    source          TEXT,
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(scope, scope_name, metric, year)
);

CREATE INDEX IF NOT EXISTS idx_benchmarks_scope
    ON benchmarks(scope, scope_name);

-- ============================================================
-- TABLA: analysis_results
-- Histórico de análisis realizados
-- ============================================================
CREATE TABLE IF NOT EXISTS analysis_results (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    query           TEXT NOT NULL,              -- Input original del usuario
    radius_km       INTEGER NOT NULL DEFAULT 10,
    lat             FLOAT,
    lng             FLOAT,
    address_resolved TEXT,                      -- Dirección geocodificada
    result          JSONB,                      -- Resultado completo del análisis
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_analysis_location
    ON analysis_results(lat, lng);

CREATE INDEX IF NOT EXISTS idx_analysis_created
    ON analysis_results(created_at DESC);

-- ============================================================
-- DATOS INICIALES: Benchmarks nacionales España
-- Basados en estimaciones públicas del sector
-- ============================================================
INSERT INTO benchmarks (scope, scope_name, metric, value, unit, source) VALUES
    ('national', 'España', 'inhabitants_per_court',        3800, 'ratio',  'estimacion_sector_2024'),
    ('national', 'España', 'inhabitants_per_indoor_court', 18000,'ratio',  'estimacion_sector_2024'),
    ('national', 'España', 'indoor_ratio',                 0.21, 'pct',    'estimacion_sector_2024'),
    ('national', 'España', 'avg_price_valley',             8.50, 'eur',    'estimacion_sector_2024'),
    ('national', 'España', 'avg_price_peak',               14.00,'eur',    'estimacion_sector_2024'),
    ('national', 'España', 'total_clubs',                  4500, 'count',  'rfep_2024'),
    ('national', 'España', 'total_courts',                 12000,'count',  'rfep_2024')
ON CONFLICT (scope, scope_name, metric, year) DO NOTHING;
