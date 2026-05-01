CREATE TABLE remote_wallpapers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id UUID NOT NULL REFERENCES wallpaper_sources(id) ON DELETE CASCADE,
    title TEXT,
    original_url TEXT NOT NULL,
    page_url TEXT,
    storage_key TEXT,
    thumbnail_key TEXT,
    thumbnail_url TEXT,
    media_type TEXT NOT NULL DEFAULT 'video',
    file_size_bytes BIGINT,
    author TEXT,
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    is_active BOOLEAN NOT NULL DEFAULT true,
    UNIQUE(source_id, original_url)
);

CREATE INDEX idx_remote_wallpapers_source ON remote_wallpapers(source_id);
CREATE INDEX idx_remote_wallpapers_active ON remote_wallpapers(is_active, expires_at);
