-- Record pixel dimensions so the admin UI can show "1920 × 1080" etc.
-- NULL means "not measured" (older rows, or video files we don't probe).
ALTER TABLE remote_wallpapers
    ADD COLUMN IF NOT EXISTS width  INT,
    ADD COLUMN IF NOT EXISTS height INT;
