-- Add Bing daily wallpaper source
INSERT INTO wallpaper_sources (name, site_url, enabled, fetch_batch_size, cache_ttl_hours, fetch_interval_hours, source_type, scraper_type)
VALUES (
    'Bing 每日壁纸',
    'https://www.bing.com/HPImageArchive.aspx?format=js&n=8&mkt=zh-CN',
    true,
    15,
    168,
    24,
    'image',
    'bing'
)
ON CONFLICT DO NOTHING;
