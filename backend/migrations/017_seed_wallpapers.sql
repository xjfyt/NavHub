-- Builtin curated source (static seeded entries, no auto-fetch)
INSERT INTO wallpaper_sources (id, name, site_url, enabled, fetch_batch_size, cache_ttl_hours, fetch_interval_hours, source_type, scraper_type)
VALUES (
    '00000000-0000-0000-0000-000000000001'::uuid,
    '内置精选壁纸',
    'builtin',
    false,
    0,
    0,
    876000,
    'both',
    'builtin'
)
ON CONFLICT (id) DO NOTHING;

-- Add Wikimedia Commons video scraper source
INSERT INTO wallpaper_sources (name, site_url, enabled, fetch_batch_size, cache_ttl_hours, fetch_interval_hours, source_type, scraper_type)
VALUES (
    'Wikimedia Commons 动态壁纸',
    'https://commons.wikimedia.org/w/api.php?action=query&list=categorymembers&cmtitle=Category:Time-lapse_videos&cmtype=file&cmlimit=100&format=json',
    true, 20, 720, 168, 'video', 'wikimedia'
);

-- Add NASA image scraper source
INSERT INTO wallpaper_sources (name, site_url, enabled, fetch_batch_size, cache_ttl_hours, fetch_interval_hours, source_type, scraper_type)
VALUES (
    'NASA 天文图库',
    'https://images-api.nasa.gov/search?q=aurora%20nebula%20galaxy%20earth&media_type=image&page_size=80',
    true, 30, 720, 168, 'image', 'nasa'
);

-- ========== Seed existing hardcoded presets into remote_wallpapers ==========
-- Static images: Wikimedia Commons
INSERT INTO remote_wallpapers (source_id, title, original_url, thumbnail_url, media_type, author, page_url, expires_at) VALUES
(
    '00000000-0000-0000-0000-000000000001'::uuid,
    'Lake Mountain Landscape',
    'https://commons.wikimedia.org/w/index.php?title=Special:Redirect/file/Lake%20Mountain%20Landscape.jpg&width=1920',
    'https://commons.wikimedia.org/w/index.php?title=Special:Redirect/file/Lake%20Mountain%20Landscape.jpg&width=640',
    'image',
    'Bonnie Moreland',
    'https://commons.wikimedia.org/wiki/File:Lake_Mountain_Landscape.jpg',
    NULL
),
(
    '00000000-0000-0000-0000-000000000001'::uuid,
    'Mountain Lake Vista',
    'https://commons.wikimedia.org/w/index.php?title=Special:Redirect/file/Mountain%20Lake%20Vista.jpg&width=1920',
    'https://commons.wikimedia.org/w/index.php?title=Special:Redirect/file/Mountain%20Lake%20Vista.jpg&width=640',
    'image',
    NULL,
    'https://commons.wikimedia.org/wiki/File:Mountain_Lake_Vista.jpg',
    NULL
),
(
    '00000000-0000-0000-0000-000000000001'::uuid,
    'Landscape Mountains Nature Lake',
    'https://commons.wikimedia.org/w/index.php?title=Special:Redirect/file/Landscape-mountains-nature-lake%20(24326735085).jpg&width=1920',
    'https://commons.wikimedia.org/w/index.php?title=Special:Redirect/file/Landscape-mountains-nature-lake%20(24326735085).jpg&width=640',
    'image',
    'pixellaphoto',
    'https://commons.wikimedia.org/wiki/File:Landscape-mountains-nature-lake_(24326735085).jpg',
    NULL
),
(
    '00000000-0000-0000-0000-000000000001'::uuid,
    'Morning Reflection at Gangapurna Lake',
    'https://commons.wikimedia.org/w/index.php?title=Special:Redirect/file/Morning%20Reflection%20at%20Gangapurna%20Lake.jpg&width=1920',
    'https://commons.wikimedia.org/w/index.php?title=Special:Redirect/file/Morning%20Reflection%20at%20Gangapurna%20Lake.jpg&width=640',
    'image',
    NULL,
    'https://commons.wikimedia.org/wiki/File:Morning_Reflection_at_Gangapurna_Lake.jpg',
    NULL
),
-- Static images: NASA
(
    '00000000-0000-0000-0000-000000000001'::uuid,
    'Aurora Borealis Blankets the Earth',
    'https://images-assets.nasa.gov/image/iss072e159172/iss072e159172~large.jpg',
    'https://images-assets.nasa.gov/image/iss072e159172/iss072e159172~medium.jpg',
    'image',
    'NASA',
    'https://images.nasa.gov/details/iss072e159172',
    NULL
),
(
    '00000000-0000-0000-0000-000000000001'::uuid,
    'Earth Limb with Aurora',
    'https://images-assets.nasa.gov/image/iss058e005282/iss058e005282~large.jpg',
    'https://images-assets.nasa.gov/image/iss058e005282/iss058e005282~medium.jpg',
    'image',
    'NASA',
    'https://images.nasa.gov/details/iss058e005282',
    NULL
),
(
    '00000000-0000-0000-0000-000000000001'::uuid,
    'Aurora Australis',
    'https://images-assets.nasa.gov/image/s45-31-012/s45-31-012~large.jpg',
    'https://images-assets.nasa.gov/image/s45-31-012/s45-31-012~medium.jpg',
    'image',
    'NASA',
    'https://images.nasa.gov/details/s45-31-012',
    NULL
),
(
    '00000000-0000-0000-0000-000000000001'::uuid,
    'Cygnus Loop Nebula',
    'https://images-assets.nasa.gov/image/PIA15415/PIA15415~large.jpg',
    'https://images-assets.nasa.gov/image/PIA15415/PIA15415~medium.jpg',
    'image',
    'NASA',
    'https://images.nasa.gov/details/PIA15415',
    NULL
),
(
    '00000000-0000-0000-0000-000000000001'::uuid,
    'Lambda Centauri Nebula',
    'https://images-assets.nasa.gov/image/PIA13451/PIA13451~large.jpg',
    'https://images-assets.nasa.gov/image/PIA13451/PIA13451~medium.jpg',
    'image',
    'NASA',
    'https://images.nasa.gov/details/PIA13451',
    NULL
),
-- Static images: Lorem Picsum
(
    '00000000-0000-0000-0000-000000000001'::uuid,
    'Alpine Ridge',
    'https://picsum.photos/id/1015/1920/1080.webp',
    'https://picsum.photos/id/1015/640/360.webp',
    'image',
    'Alexey Topolyanskiy',
    'https://picsum.photos/id/1015/info',
    NULL
),
(
    '00000000-0000-0000-0000-000000000001'::uuid,
    'Fjord Road',
    'https://picsum.photos/id/1018/1920/1080.webp',
    'https://picsum.photos/id/1018/640/360.webp',
    'image',
    'Andrew Ridley',
    'https://picsum.photos/id/1018/info',
    NULL
),
(
    '00000000-0000-0000-0000-000000000001'::uuid,
    'Sea Cliff',
    'https://picsum.photos/id/1016/1920/1080.webp',
    'https://picsum.photos/id/1016/640/360.webp',
    'image',
    'Philippe Wuyts',
    'https://picsum.photos/id/1016/info',
    NULL
),
-- Dynamic videos: Wikimedia Commons
(
    '00000000-0000-0000-0000-000000000001'::uuid,
    'Aurora Borealis Timelapse',
    'https://commons.wikimedia.org/w/index.php?title=Special:Redirect/file/Aurora_borealis_timelapse.webm',
    'https://commons.wikimedia.org/w/index.php?title=Special:Redirect/file/Aurora_borealis_timelapse.webm&width=640',
    'video',
    'Eatcha',
    'https://commons.wikimedia.org/wiki/File:Aurora_borealis_timelapse.webm',
    NULL
),
(
    '00000000-0000-0000-0000-000000000001'::uuid,
    'Clouds Time Lapse',
    'https://commons.wikimedia.org/w/index.php?title=Special:Redirect/file/Clouds_(time_lapse).webm',
    'https://commons.wikimedia.org/w/index.php?title=Special:Redirect/file/Clouds_(time_lapse).webm&width=640',
    'video',
    NULL,
    'https://commons.wikimedia.org/wiki/File:Clouds_(time_lapse).webm',
    NULL
),
(
    '00000000-0000-0000-0000-000000000001'::uuid,
    'Sunrise Timelapse',
    'https://commons.wikimedia.org/w/index.php?title=Special:Redirect/file/Sunrise_timelapse.webm',
    'https://commons.wikimedia.org/w/index.php?title=Special:Redirect/file/Sunrise_timelapse.webm&width=640',
    'video',
    'James West',
    'https://commons.wikimedia.org/wiki/File:Sunrise_timelapse.webm',
    NULL
),
(
    '00000000-0000-0000-0000-000000000001'::uuid,
    'All4sounds Cloud Time Lapse',
    'https://commons.wikimedia.org/w/index.php?title=Special:Redirect/file/All4sounds_-_Cloud_Time_lapse.webm',
    'https://commons.wikimedia.org/w/index.php?title=Special:Redirect/file/All4sounds_-_Cloud_Time_lapse.webm&width=640',
    'video',
    'All4sounds',
    'https://commons.wikimedia.org/wiki/File:All4sounds_-_Cloud_Time_lapse.webm',
    NULL
),
(
    '00000000-0000-0000-0000-000000000001'::uuid,
    'Flight over Clouds',
    'https://commons.wikimedia.org/w/index.php?title=Special:Redirect/file/Flight_over_clouds.webm',
    'https://commons.wikimedia.org/w/index.php?title=Special:Redirect/file/Flight_over_clouds.webm&width=640',
    'video',
    NULL,
    'https://commons.wikimedia.org/wiki/File:Flight_over_clouds.webm',
    NULL
)
ON CONFLICT (source_id, original_url) DO NOTHING;
