-- Reset all image icons from the legacy 'framed' default to 'plain'.
-- Icons with explicit image URLs should fill their tile like native app icons.
UPDATE icons SET image_style = 'plain' WHERE image_url IS NOT NULL AND image_style = 'framed';
UPDATE folder_items SET image_style = 'plain' WHERE image_url IS NOT NULL AND image_style = 'framed';

-- Change column defaults so future rows start with 'plain'.
ALTER TABLE icons ALTER COLUMN image_style SET DEFAULT 'plain';
ALTER TABLE folder_items ALTER COLUMN image_style SET DEFAULT 'plain';
