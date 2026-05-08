-- Drop the legacy `group_visibility` table — visibility was reworked into
-- `groups.push_target_*` columns in migration 011, leaving this table orphaned.
DROP TABLE IF EXISTS group_visibility;

-- Workspace's "groups visible to user" query OR-joins on push_target_type and
-- push_target_role. A composite index lets PG short-circuit the partial scans.
CREATE INDEX IF NOT EXISTS idx_groups_pushed_target
    ON groups(pushed, push_target_type, push_target_role)
    WHERE pushed = TRUE;

-- Audit log filtering. Existing index covers (ts DESC) and (kind), but the
-- admin UI's "logs by action" query needs (action, ts DESC) for paged scans.
CREATE INDEX IF NOT EXISTS idx_audit_action_ts ON audit_log(action, ts DESC);

-- Deduping uploads by sha256 is on the hot path of every icon upload.
CREATE INDEX IF NOT EXISTS idx_library_icons_sha256 ON library_icons(sha256);
