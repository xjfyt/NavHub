CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor_created ON audit_log(actor_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_icons_group_sort ON icons(group_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_widgets_group_sort ON widgets(group_id, sort_order);
