-- Fix Wikimedia category: 'Timelapse_videos' is empty; correct name is 'Time-lapse_videos'
UPDATE wallpaper_sources
SET site_url = 'https://commons.wikimedia.org/w/api.php?action=query&list=categorymembers&cmtitle=Category:Time-lapse_videos&cmtype=file&cmlimit=50&format=json',
    updated_at = now()
WHERE scraper_type = 'wikimedia'
  AND site_url LIKE '%Timelapse_videos%';

-- Fix NASA query: compound multi-keyword query returns 0 results; use individual term
UPDATE wallpaper_sources
SET site_url = 'https://images-api.nasa.gov/search?q=nebula+galaxy+earth&media_type=image&page_size=20',
    updated_at = now()
WHERE scraper_type = 'nasa'
  AND site_url LIKE '%earth+aurora+nebula%';
