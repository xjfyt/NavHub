-- Prefer Pexels search tuned for wallpaper-quality landscapes over the generic curated feed.
-- Keep any existing api_key suffix from the previous seeded URL.
UPDATE wallpaper_sources
SET site_url = replace(
        site_url,
        'https://api.pexels.com/v1/curated?per_page=30',
        'https://api.pexels.com/v1/search?query=nature%20landscape%20scenic%20mountains%20ocean%20forest%20waterfall&orientation=landscape&size=large&per_page=80'
    ),
    updated_at = now()
WHERE scraper_type = 'pexels'
  AND site_url LIKE 'https://api.pexels.com/v1/curated?per_page=30%';
