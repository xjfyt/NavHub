CREATE TABLE system_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    level TEXT NOT NULL DEFAULT 'info'
        CHECK (level IN ('info', 'success', 'warning', 'error')),
    target_type TEXT NOT NULL
        CHECK (target_type IN ('all', 'role', 'user')),
    target_role TEXT
        CHECK (target_role IS NULL OR target_role IN ('superadmin', 'admin', 'user', 'guest')),
    target_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    link_url TEXT,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (
        (target_type = 'all' AND target_role IS NULL AND target_user_id IS NULL) OR
        (target_type = 'role' AND target_role IS NOT NULL AND target_user_id IS NULL) OR
        (target_type = 'user' AND target_role IS NULL AND target_user_id IS NOT NULL)
    )
);

CREATE INDEX system_messages_created_idx ON system_messages(created_at DESC);
CREATE INDEX system_messages_target_user_idx ON system_messages(target_user_id) WHERE target_user_id IS NOT NULL;
CREATE INDEX system_messages_target_role_idx ON system_messages(target_role) WHERE target_role IS NOT NULL;

CREATE TABLE message_reads (
    message_id UUID NOT NULL REFERENCES system_messages(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (message_id, user_id)
);

CREATE INDEX message_reads_user_idx ON message_reads(user_id, read_at DESC);
