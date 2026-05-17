-- Add Unsplash high-quality wallpaper source.
-- Replace YOUR_UNSPLASH_ACCESS_KEY with a real key from https://unsplash.com/developers
INSERT INTO wallpaper_sources (name, site_url, enabled, fetch_batch_size, cache_ttl_hours, fetch_interval_hours, source_type, scraper_type)
VALUES (
    'Unsplash 高质量壁纸',
    'https://api.unsplash.com/search/photos?query=nature%20landscape%20scenic%20wallpaper&orientation=landscape&per_page=30&order_by=popular&client_id=YOUR_UNSPLASH_ACCESS_KEY',
    false,
    30,
    720,
    168,
    'image',
    'unsplash'
)
ON CONFLICT DO NOTHING;
