-- 003_icon_libraries.sql

CREATE TABLE icon_libraries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE library_icons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    library_id UUID NULL REFERENCES icon_libraries(id) ON DELETE CASCADE,
    sha256 TEXT NOT NULL,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    uploader_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
    size INT NOT NULL DEFAULT 0,
    content_type TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(library_id, sha256)
);

-- For fast sha256 deduplication lookup across the entire table
CREATE INDEX idx_library_icons_sha256 ON library_icons(sha256);
