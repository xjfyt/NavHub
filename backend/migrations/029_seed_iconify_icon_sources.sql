-- Seed the four iconify-backed icon sources we run in production.
-- Idempotent: each row is inserted only if no source with the same name exists,
-- so re-running this on an already-seeded DB is a no-op.

INSERT INTO icon_asset_sources
    (name, site_url, enabled, fetch_batch_size, cache_ttl_hours, fetch_interval_hours, source_type, scraper_type)
SELECT 'skill-icons',
       'https://icon-sets.iconify.design/skill-icons',
       true, 200, 168, 24, 'svg', 'iconify'
WHERE NOT EXISTS (SELECT 1 FROM icon_asset_sources WHERE name = 'skill-icons');

INSERT INTO icon_asset_sources
    (name, site_url, enabled, fetch_batch_size, cache_ttl_hours, fetch_interval_hours, source_type, scraper_type)
SELECT 'fluent-emoji-flat',
       'https://icon-sets.iconify.design/fluent-emoji-flat',
       true, 50, 1680, 24, 'svg', 'iconify'
WHERE NOT EXISTS (SELECT 1 FROM icon_asset_sources WHERE name = 'fluent-emoji-flat');

INSERT INTO icon_asset_sources
    (name, site_url, enabled, fetch_batch_size, cache_ttl_hours, fetch_interval_hours, source_type, scraper_type)
SELECT 'streamline-kameleon-color',
       'https://icon-sets.iconify.design/streamline-kameleon-color',
       true, 50, 16800, 24, 'svg', 'iconify'
WHERE NOT EXISTS (SELECT 1 FROM icon_asset_sources WHERE name = 'streamline-kameleon-color');

INSERT INTO icon_asset_sources
    (name, site_url, enabled, fetch_batch_size, cache_ttl_hours, fetch_interval_hours, source_type, scraper_type)
SELECT 'logos',
       'https://icon-sets.iconify.design/logos',
       true, 50, 16800, 24, 'svg', 'iconify'
WHERE NOT EXISTS (SELECT 1 FROM icon_asset_sources WHERE name = 'logos');
