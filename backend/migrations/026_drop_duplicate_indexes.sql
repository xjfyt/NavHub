-- migration 001 创建了 icons_group_idx 和 widgets_group_idx 两个索引在 (group_id, sort_order)；
-- migration 012 又用更长的名字 idx_icons_group_sort / idx_widgets_group_sort 创建了完全相同的索引。
-- 重复索引浪费写入开销和磁盘，drop 掉旧的更短命名，保留 idx_ 前缀的统一命名风格。
DROP INDEX IF EXISTS icons_group_idx;
DROP INDEX IF EXISTS widgets_group_idx;
