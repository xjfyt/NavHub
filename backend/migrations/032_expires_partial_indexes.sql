-- DATA-5: 过期清理查询走全表扫描的问题。
--
-- 后台清理(tasks.rs)对 remote_wallpapers / remote_icon_assets 反复执行
--   DELETE ... WHERE expires_at IS NOT NULL AND expires_at < now() LIMIT N
-- 两表(016 / 024)各只有 (is_active, expires_at) 复合索引,前导列是 is_active,
-- 上述查询并不按 is_active 过滤,无法高效利用该索引,退化为全表扫描。
--
-- 这里为两表分别建立 expires_at 的「部分索引」(仅索引 expires_at IS NOT NULL 的
-- 行,与查询条件完全吻合且体积更小),让过期清理走索引范围扫描。与 010 的
-- system_messages_expires_idx 同一套路。
--
-- 用 IF NOT EXISTS 与现有迁移惯例保持一致;不使用 CONCURRENTLY —— 迁移在事务内
-- 执行(db.rs 的 conn.apply),CONCURRENTLY 不可在事务中运行。

CREATE INDEX IF NOT EXISTS idx_remote_wallpapers_expires
    ON remote_wallpapers(expires_at)
    WHERE expires_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_remote_icon_assets_expires
    ON remote_icon_assets(expires_at)
    WHERE expires_at IS NOT NULL;
