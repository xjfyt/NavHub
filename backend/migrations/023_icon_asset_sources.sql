CREATE TABLE icon_asset_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    site_url TEXT NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT true,
    fetch_batch_size INT NOT NULL DEFAULT 50,
    cache_ttl_hours INT NOT NULL DEFAULT 168,
    fetch_interval_hours INT NOT NULL DEFAULT 24,
    source_type TEXT NOT NULL DEFAULT 'svg',
    scraper_type TEXT NOT NULL DEFAULT 'simpleicons',
    last_fetched_at TIMESTAMPTZ,
    total_fetched INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO icon_asset_sources (name, site_url, enabled, fetch_batch_size, cache_ttl_hours, fetch_interval_hours, source_type, scraper_type)
VALUES ('Simple Icons', 'https://simpleicons.org', true, 50, 168, 24, 'svg', 'simpleicons');
