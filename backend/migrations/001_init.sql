CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL UNIQUE,
    display_name TEXT,
    avatar_url TEXT,
    role TEXT NOT NULL CHECK (role IN ('superadmin','admin','user','guest')),
    password_hash TEXT,
    casdoor_id TEXT UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at TIMESTAMPTZ
);

CREATE TABLE groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    icon TEXT NOT NULL DEFAULT 'grid',
    owner_id UUID REFERENCES users(id) ON DELETE CASCADE,
    pushed BOOLEAN NOT NULL DEFAULT FALSE,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX groups_owner_idx ON groups(owner_id);
CREATE INDEX groups_pushed_idx ON groups(pushed) WHERE pushed = TRUE;

CREATE TABLE icons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    url TEXT,
    sub TEXT,
    title TEXT,
    cta TEXT,
    size TEXT NOT NULL DEFAULT 'sq' CHECK (size IN ('sq','pill-size','circle-size','lg')),
    letter TEXT,
    color INT NOT NULL DEFAULT 0,
    image_url TEXT,
    is_folder BOOLEAN NOT NULL DEFAULT FALSE,
    iframe_preview BOOLEAN NOT NULL DEFAULT FALSE,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX icons_group_idx ON icons(group_id, sort_order);

CREATE TABLE folder_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    folder_icon_id UUID NOT NULL REFERENCES icons(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    letter TEXT,
    color INT NOT NULL DEFAULT 0,
    url TEXT,
    image_url TEXT,
    sort_order INT NOT NULL DEFAULT 0
);
CREATE INDEX folder_items_folder_idx ON folder_items(folder_icon_id, sort_order);

CREATE TABLE widgets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    widget_type TEXT NOT NULL,
    w_span INT NOT NULL DEFAULT 1,
    w_row INT,
    config JSONB NOT NULL DEFAULT '{}'::jsonb,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX widgets_group_idx ON widgets(group_id, sort_order);

CREATE TABLE user_preferences (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    tweaks JSONB NOT NULL DEFAULT '{}'::jsonb,
    custom_engines JSONB NOT NULL DEFAULT '{}'::jsonb,
    pushed_group_wallpapers JSONB NOT NULL DEFAULT '{}'::jsonb,
    sidebar_order UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE group_visibility (
    role TEXT NOT NULL,
    group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    PRIMARY KEY (role, group_id)
);

CREATE TABLE audit_log (
    id BIGSERIAL PRIMARY KEY,
    ts TIMESTAMPTZ NOT NULL DEFAULT now(),
    actor_id UUID,
    actor_name TEXT,
    action TEXT NOT NULL,
    target TEXT,
    kind TEXT NOT NULL,
    detail JSONB
);
CREATE INDEX audit_ts_idx ON audit_log(ts DESC);
CREATE INDEX audit_kind_idx ON audit_log(kind);

CREATE TABLE app_settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
