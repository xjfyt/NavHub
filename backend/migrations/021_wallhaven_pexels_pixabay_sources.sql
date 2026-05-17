-- Wallhaven: free, no API key required for SFW content (purity=100).
-- categories: 110 = general+anime (exclude people), sorting=hot, atleast=1920x1080.
-- Optional: append &apikey=YOUR_KEY to site_url for higher rate limits.
INSERT INTO wallpaper_sources (name, site_url, enabled, fetch_batch_size, cache_ttl_hours, fetch_interval_hours, source_type, scraper_type)
VALUES (
    'Wallhaven 热门壁纸',
    'https://wallhaven.cc/api/v1/search?purity=100&categories=110&sorting=hot&atleast=1920x1080',
    true,
    24,
    168,
    72,
    'image',
    'wallhaven'
)
ON CONFLICT DO NOTHING;

-- Pexels: free API key required. Register at https://www.pexels.com/api/
-- Replace YOUR_PEXELS_API_KEY with a real key. Quota: 200 req/hour, 20k/month.
INSERT INTO wallpaper_sources (name, site_url, enabled, fetch_batch_size, cache_ttl_hours, fetch_interval_hours, source_type, scraper_type)
VALUES (
    'Pexels 精选壁纸',
    'https://api.pexels.com/v1/search?query=nature%20landscape%20scenic%20mountains%20ocean%20forest%20waterfall&orientation=landscape&size=large&per_page=80&api_key=YOUR_PEXELS_API_KEY',
    false,
    30,
    720,
    168,
    'image',
    'pexels'
)
ON CONFLICT DO NOTHING;

-- Pixabay: free API key required. Register at https://pixabay.com/api/docs/
-- Replace YOUR_PIXABAY_API_KEY with a real key. Quota: 100 req/min (free tier).
INSERT INTO wallpaper_sources (name, site_url, enabled, fetch_batch_size, cache_ttl_hours, fetch_interval_hours, source_type, scraper_type)
VALUES (
    'Pixabay 自然风景',
    'https://pixabay.com/api/?key=YOUR_PIXABAY_API_KEY&category=nature&min_width=1920&per_page=30&order=popular',
    false,
    30,
    720,
    168,
    'image',
    'pixabay'
)
ON CONFLICT DO NOTHING;
