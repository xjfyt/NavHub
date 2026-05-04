CREATE TABLE remote_icon_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id UUID NOT NULL REFERENCES icon_asset_sources(id) ON DELETE CASCADE,
    title TEXT,
    original_url TEXT NOT NULL,
    storage_key TEXT,
    media_type TEXT NOT NULL DEFAULT 'svg',
    file_size_bytes BIGINT,
    author TEXT,
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    is_active BOOLEAN NOT NULL DEFAULT true,
    UNIQUE(source_id, original_url)
);

CREATE INDEX idx_remote_icon_assets_source ON remote_icon_assets(source_id);
CREATE INDEX idx_remote_icon_assets_active ON remote_icon_assets(is_active, expires_at);
