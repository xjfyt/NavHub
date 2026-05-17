-- Tighten default wallpaper source URLs so scheduled fetches pull landscape, high-resolution candidates.
UPDATE wallpaper_sources
SET site_url = 'https://www.desktophut.com/category/landscape-live-wallpapers',
    updated_at = now()
WHERE scraper_type = 'desktophut'
  AND site_url = 'https://www.desktophut.com';

UPDATE wallpaper_sources
SET site_url = 'https://commons.wikimedia.org/w/api.php?action=query&list=categorymembers&cmtitle=Category:Time-lapse_videos&cmtype=file&cmlimit=100&format=json',
    fetch_batch_size = GREATEST(fetch_batch_size, 20),
    updated_at = now()
WHERE scraper_type = 'wikimedia'
  AND site_url LIKE '%Category:Timelapse_videos%';

UPDATE wallpaper_sources
SET site_url = 'https://images-api.nasa.gov/search?q=aurora%20nebula%20galaxy%20earth&media_type=image&page_size=80',
    fetch_batch_size = GREATEST(fetch_batch_size, 30),
    updated_at = now()
WHERE scraper_type = 'nasa'
  AND site_url LIKE 'https://images-api.nasa.gov/search?q=earth+aurora+nebula+galaxy+space%';

UPDATE wallpaper_sources
SET site_url = replace(
        site_url,
        'https://api.unsplash.com/photos?per_page=30&order_by=popular',
        'https://api.unsplash.com/search/photos?query=nature%20landscape%20scenic%20wallpaper&orientation=landscape&per_page=30&order_by=popular'
    ),
    updated_at = now()
WHERE scraper_type = 'unsplash'
  AND site_url LIKE 'https://api.unsplash.com/photos?per_page=30&order_by=popular%';

UPDATE wallpaper_sources
SET site_url = replace(
        site_url,
        'https://wallhaven.cc/api/v1/search?purity=100&categories=110&sorting=hot&atleast=1920x1080',
        'https://wallhaven.cc/api/v1/search?purity=100&categories=100&sorting=toplist&topRange=1M&atleast=2560x1440&ratios=16x9,16x10'
    ),
    updated_at = now()
WHERE scraper_type = 'wallhaven'
  AND site_url LIKE 'https://wallhaven.cc/api/v1/search?purity=100&categories=110&sorting=hot&atleast=1920x1080%';

UPDATE wallpaper_sources
SET site_url = replace(
        site_url,
        'category=nature&min_width=1920&per_page=30&order=popular',
        'category=nature&image_type=photo&orientation=horizontal&min_width=2560&min_height=1440&per_page=50&order=popular&safesearch=true'
    ),
    updated_at = now()
WHERE scraper_type = 'pixabay'
  AND site_url LIKE 'https://pixabay.com/api/?%category=nature&min_width=1920&per_page=30&order=popular%';
