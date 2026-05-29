//! Long-lived background workers. Each task respects a shared shutdown flag so
//! `axum::serve(...).with_graceful_shutdown` can drain in-flight work cleanly.
//!
//! The previous wiring (4× `tokio::spawn` inside `main.rs`) had three problems:
//!   1. No graceful shutdown — workers kept running after the HTTP server stopped.
//!   2. No overlap protection — if a fetch took longer than the interval, the next
//!      tick would queue a duplicate fetch on top of the in-flight one.
//!   3. The audit cleanup ran a single unbounded `DELETE`, which can hold an
//!      AccessExclusiveLock on `audit_log` long enough to stall writes.

use crate::{
    handlers::admin::{icon_asset_sources, wallpapers},
    models::{IconAssetSource, WallpaperSource},
    state::AppState,
};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tokio::task::JoinHandle;

/// Coordinates shutdown for every background worker spawned at startup.
pub struct BackgroundHandles {
    handles: Vec<JoinHandle<()>>,
    shutdown: Arc<AtomicBool>,
}

impl BackgroundHandles {
    pub fn spawn_all(state: Arc<AppState>) -> Self {
        let shutdown = Arc::new(AtomicBool::new(false));
        let handles = vec![
            tokio::spawn(audit_cleanup_loop(state.clone(), shutdown.clone())),
            tokio::spawn(wallpaper_loop(state.clone(), shutdown.clone())),
            tokio::spawn(icon_loop(state.clone(), shutdown.clone())),
            tokio::spawn(system_message_cleanup_loop(state.clone(), shutdown.clone())),
            tokio::spawn(library_icon_gc_loop(state.clone(), shutdown.clone())),
        ];
        Self { handles, shutdown }
    }

    /// Signal all workers to stop and wait for them to drain. Bounded by `timeout`
    /// so a stuck worker can't block the process from exiting.
    pub async fn shutdown(self, timeout: Duration) {
        self.shutdown.store(true, Ordering::Relaxed);
        let drain = async {
            for h in self.handles {
                let _ = h.await;
            }
        };
        if tokio::time::timeout(timeout, drain).await.is_err() {
            tracing::warn!(
                "background workers did not drain within {:?}, abandoning",
                timeout
            );
        }
    }
}

/// Sleep up to `dur`, returning early if a shutdown was requested. Returns true
/// if the loop should continue running, false if it should exit.
async fn sleep_or_shutdown(dur: Duration, shutdown: &AtomicBool) -> bool {
    let mut remaining = dur;
    let step = Duration::from_secs(1);
    while remaining > Duration::ZERO {
        if shutdown.load(Ordering::Relaxed) {
            return false;
        }
        let chunk = remaining.min(step);
        tokio::time::sleep(chunk).await;
        remaining = remaining.saturating_sub(chunk);
    }
    !shutdown.load(Ordering::Relaxed)
}

/// Trim audit rows older than `audit_retention_days` in 5k-row batches so we
/// never hold a long-running lock on `audit_log`. The previous one-shot DELETE
/// had no LIMIT, which meant a backlog could stall every audit insert behind
/// it for the duration of the scan.
async fn audit_cleanup_loop(state: Arc<AppState>, shutdown: Arc<AtomicBool>) {
    let day = Duration::from_secs(86_400);
    while sleep_or_shutdown(day, &shutdown).await {
        let retention = state.cfg.app.audit_retention_days.max(1);
        tracing::info!("audit cleanup: trimming rows older than {} days", retention);
        let mut total: u64 = 0;
        loop {
            if shutdown.load(Ordering::Relaxed) {
                break;
            }
            let res = sqlx::query(
                "DELETE FROM audit_log WHERE id IN (\
                    SELECT id FROM audit_log \
                    WHERE ts < now() - ($1 || ' days')::interval \
                    ORDER BY id ASC \
                    LIMIT 5000\
                )",
            )
            .bind(retention.to_string())
            .execute(&state.pg)
            .await;
            match res {
                Ok(r) if r.rows_affected() == 0 => break,
                Ok(r) => {
                    total += r.rows_affected();
                    // Yield briefly between batches so we don't monopolize a connection.
                    tokio::time::sleep(Duration::from_millis(100)).await;
                }
                Err(e) => {
                    tracing::warn!("audit cleanup batch failed: {e}");
                    break;
                }
            }
        }
        if total > 0 {
            tracing::info!("audit cleanup: removed {total} rows");
        }
    }
}

/// DATA-2: 每批删除多少行过期 system_messages。与 audit_log 同理用 5000 行小批,
/// 避免一次性 DELETE 在 system_messages 上长时间持有锁拖住消息读写。
const MESSAGE_CLEANUP_BATCH: i64 = 5_000;

/// DATA-2: 把配置/调用方给的批大小夹到 [1, MESSAGE_CLEANUP_BATCH],杜绝 0(死循环
/// 永远删不动)或负数/超大值。纯函数,可单测。
fn clamp_cleanup_batch(requested: i64) -> i64 {
    requested.clamp(1, MESSAGE_CLEANUP_BATCH)
}

/// DATA-2: 过期 system_messages 此前从不清理 → 表无界增长,且 message_reads 留下
/// 孤儿行。新增每日一次的后台清理:分 5000 行小批删除已过期消息(expires_at < now()),
/// message_reads 因 ON DELETE CASCADE 随之清理;删空即停,支持优雅关停。
async fn system_message_cleanup_loop(state: Arc<AppState>, shutdown: Arc<AtomicBool>) {
    let day = Duration::from_secs(86_400);
    while sleep_or_shutdown(day, &shutdown).await {
        tracing::info!("system message cleanup: purging expired messages");
        let batch = clamp_cleanup_batch(MESSAGE_CLEANUP_BATCH);
        let mut total: u64 = 0;
        loop {
            if shutdown.load(Ordering::Relaxed) {
                break;
            }
            let res = sqlx::query(
                "DELETE FROM system_messages WHERE id IN (\
                    SELECT id FROM system_messages \
                    WHERE expires_at IS NOT NULL AND expires_at < now() \
                    ORDER BY expires_at ASC \
                    LIMIT $1\
                )",
            )
            .bind(batch)
            .execute(&state.pg)
            .await;
            match res {
                Ok(r) if r.rows_affected() == 0 => break,
                Ok(r) => {
                    total += r.rows_affected();
                    tokio::time::sleep(Duration::from_millis(100)).await;
                }
                Err(e) => {
                    tracing::warn!("system message cleanup batch failed: {e}");
                    break;
                }
            }
        }
        if total > 0 {
            tracing::info!("system message cleanup: removed {total} expired messages");
        }
    }
}

/// DATA-4: 上传图标(library_icons,library_id 为 NULL 的临时上传)在不再被任何
/// icons.image_url / folder_items.image_url 引用后,行与 S3 blob 都不会被回收 →
/// 孤儿无界增长。新增周期性 GC:找出零引用的临时上传行,删行 + 删对象。
///
/// 注意:
///  - 只 GC library_id IS NULL 的行。library_id 非空的是已归档进命名图标库的目录
///    资产,即便当前无 icon 引用也应保留(它是图标库的素材,不是孤儿)。
///  - 设 1 天宽限期(created_at < now() - interval '1 day'),避免误删「刚上传、
///    用户还没来得及挂到 icon 上」的新行(上传与建 icon 之间有时间窗)。
///  - 同一 sha256 可能被多行复用,但 url 唯一对应一个 S3 对象,只有当某 url 不再被
///    任何 library_icons 行引用时才真正删对象;这里按 id 删行,删完再判对象是否仍被
///    其它行引用,避免误删共享 blob。
const LIBRARY_ICON_GC_BATCH: i64 = 1_000;

async fn library_icon_gc_loop(state: Arc<AppState>, shutdown: Arc<AtomicBool>) {
    let day = Duration::from_secs(86_400);
    while sleep_or_shutdown(day, &shutdown).await {
        tracing::info!("library icon GC: scanning for orphaned uploads");
        let mut removed: u64 = 0;
        loop {
            if shutdown.load(Ordering::Relaxed) {
                break;
            }
            // 一批候选:library_id 为空、过宽限期的临时上传行。引用判定放到 Rust 侧用
            // 已单测的 filter_orphan_icons 完成(权威的零引用 NOT EXISTS 同义实现),
            // 便于回归且把判定逻辑收敛到一处。
            let candidates: Result<Vec<(uuid::Uuid, String)>, _> = sqlx::query_as(
                "SELECT id, url FROM library_icons \
                 WHERE library_id IS NULL \
                   AND created_at < now() - interval '1 day' \
                 LIMIT $1",
            )
            .bind(LIBRARY_ICON_GC_BATCH)
            .fetch_all(&state.pg)
            .await;
            let candidates = match candidates {
                Ok(c) if c.is_empty() => break,
                Ok(c) => c,
                Err(e) => {
                    tracing::warn!("library icon GC query failed: {e}");
                    break;
                }
            };

            // 当前仍被 icons / folder_items 引用的 url 集合(只取候选涉及的 url,避免全表扫)。
            let candidate_urls: Vec<String> = candidates.iter().map(|(_, u)| u.clone()).collect();
            let referenced: std::collections::HashSet<String> =
                match sqlx::query_scalar::<_, String>(
                    "SELECT image_url FROM icons \
                   WHERE image_url = ANY($1) \
                 UNION \
                 SELECT image_url FROM folder_items \
                   WHERE image_url = ANY($1)",
                )
                .bind(&candidate_urls)
                .fetch_all(&state.pg)
                .await
                {
                    Ok(rows) => rows.into_iter().collect(),
                    Err(e) => {
                        // 查询引用失败时保守跳过本批(宁可不删,绝不误删)。
                        tracing::warn!("library icon GC reference query failed: {e}");
                        break;
                    }
                };

            let orphan_ids = filter_orphan_icons(candidates.clone(), &referenced);
            if orphan_ids.is_empty() {
                // 本批候选全部仍被引用;继续下一批可能仍是同样这批(无 OFFSET),为避免
                // 空转,这里直接结束本轮扫描,等下个 24h 周期再扫。
                break;
            }
            // 候选行里仍被引用的留下;只对孤儿 id 删行 + 删对象。
            let orphan_id_set: std::collections::HashSet<uuid::Uuid> =
                orphan_ids.iter().copied().collect();
            let orphans: Vec<(uuid::Uuid, String)> = candidates
                .into_iter()
                .filter(|(id, _)| orphan_id_set.contains(id))
                .collect();

            let ids: Vec<uuid::Uuid> = orphans.iter().map(|(id, _)| *id).collect();
            // 先删行。
            let del = sqlx::query("DELETE FROM library_icons WHERE id = ANY($1)")
                .bind(&ids)
                .execute(&state.pg)
                .await;
            if let Err(e) = del {
                tracing::warn!("library icon GC delete failed: {e}");
                break;
            }
            removed += ids.len() as u64;

            // 删行后,逐个判断该 url 是否仍被其它 library_icons 行引用(同 sha 不同行复用同
            // 一 url 的极端情况);仅当彻底无引用时才删 S3 对象,避免误删共享 blob。
            let mut keys: Vec<String> = Vec::new();
            for (_, url) in &orphans {
                let still_used: bool =
                    sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM library_icons WHERE url = $1)")
                        .bind(url)
                        .fetch_one(&state.pg)
                        .await
                        .unwrap_or(true); // 查询失败时保守认为仍在用,不删对象。
                if !still_used {
                    if let Some(k) = crate::storage::key_from_stored_value(url) {
                        keys.push(k);
                    }
                }
            }
            if !keys.is_empty() {
                keys.sort();
                keys.dedup();
                if let Err(e) = state.storage.delete_objects(&keys).await {
                    tracing::warn!("library icon GC S3 cleanup failed: {e}");
                }
            }
            tokio::time::sleep(Duration::from_millis(100)).await;
        }
        if removed > 0 {
            tracing::info!("library icon GC: removed {removed} orphaned upload rows");
        }
    }
}

/// DATA-4: 纯逻辑 —— 给定候选 (id, url) 与「当前被引用的 url 集合」,筛出可删的孤儿
/// 候选(其 url 不在引用集合内)。GC 的 SQL NOT EXISTS 是权威判定,此函数提供同义的
/// 可单测内存版,用于回归与防御性二次过滤。
pub fn filter_orphan_icons<I>(
    candidates: I,
    referenced_urls: &std::collections::HashSet<String>,
) -> Vec<uuid::Uuid>
where
    I: IntoIterator<Item = (uuid::Uuid, String)>,
{
    candidates
        .into_iter()
        .filter(|(_, url)| !referenced_urls.contains(url))
        .map(|(id, _)| id)
        .collect()
}

async fn wallpaper_loop(state: Arc<AppState>, shutdown: Arc<AtomicBool>) {
    let interval = Duration::from_secs(3_600);
    // Tracks an in-flight tick so a slow fetch can't pile up on the next interval.
    let busy = Arc::new(tokio::sync::Mutex::new(()));
    while sleep_or_shutdown(interval, &shutdown).await {
        let Ok(_lock) = busy.try_lock() else {
            tracing::warn!("wallpaper fetch skipped: previous tick still running");
            continue;
        };
        tracing::info!("checking wallpaper sources for scheduled fetch...");
        let sources: Result<Vec<WallpaperSource>, _> = sqlx::query_as(
            "SELECT * FROM wallpaper_sources WHERE enabled = true \
             AND (last_fetched_at IS NULL OR last_fetched_at < now() - (fetch_interval_hours || ' hours')::interval)",
        )
        .fetch_all(&state.pg)
        .await;
        match sources {
            Ok(srcs) => {
                for src in srcs {
                    if shutdown.load(Ordering::Relaxed) {
                        break;
                    }
                    tracing::info!("scheduled fetch for source '{}'", src.name);
                    if let Err(e) = wallpapers::run_fetch(&state, &src).await {
                        tracing::error!("wallpaper fetch error '{}': {e}", src.name);
                    }
                }
            }
            Err(e) => tracing::warn!("wallpaper source query failed: {e}"),
        }
        // Clean up expired wallpapers — keep this small and batched for the same
        // reason as audit_log. DATA-7: RETURNING storage_key/thumbnail_key 后清理 S3,
        // 否则过期壁纸的视频/缩略图对象会永远滞留在桶里(孤儿 blob)。
        expire_wallpapers(&state, &shutdown).await;
    }
}

/// DATA-7: 分批删除过期 remote_wallpapers,并清理其 S3 对象。每批 5000 行,
/// RETURNING 对象 key 后调用 delete_objects;删空即停。对象删失败仅告警,不阻塞
/// 数据库清理(残留对象下次仍会被孤儿 GC / 重新统计兜底,但行已删干净)。
///
/// API-3: 后台过期删除此前不回算来源的 total_fetched,导致计数只增不减(与手动
/// delete_wallpaper 不一致)。改为 RETURNING source_id 收集受影响来源,删完后按
/// COUNT 逐源重算,与手动删除路径保持一致。
async fn expire_wallpapers(state: &Arc<AppState>, shutdown: &AtomicBool) {
    // (source_id, storage_key, thumbnail_key) —— DELETE ... RETURNING 的行类型,
    // 抽成别名以满足 clippy::type_complexity。
    type ExpiredWallpaperRow = (Option<uuid::Uuid>, Option<String>, Option<String>);
    let mut affected_sources: std::collections::HashSet<uuid::Uuid> =
        std::collections::HashSet::new();
    loop {
        if shutdown.load(Ordering::Relaxed) {
            break;
        }
        let rows: Result<Vec<ExpiredWallpaperRow>, _> = sqlx::query_as(
            "DELETE FROM remote_wallpapers WHERE id IN (\
                SELECT id FROM remote_wallpapers \
                WHERE expires_at IS NOT NULL AND expires_at < now() \
                LIMIT 5000\
            ) RETURNING source_id, storage_key, thumbnail_key",
        )
        .fetch_all(&state.pg)
        .await;
        match rows {
            Ok(r) if r.is_empty() => break,
            Ok(r) => {
                for (sid, _, _) in &r {
                    if let Some(sid) = sid {
                        affected_sources.insert(*sid);
                    }
                }
                let keys = wallpapers::collect_wallpaper_keys(
                    r.iter().map(|(_, s, t)| (s.as_deref(), t.as_deref())),
                );
                if !keys.is_empty() {
                    if let Err(e) = state.storage.delete_objects(&keys).await {
                        tracing::warn!("expired wallpaper S3 cleanup failed: {e}");
                    }
                }
                tokio::time::sleep(Duration::from_millis(100)).await;
            }
            Err(e) => {
                tracing::warn!("expired wallpaper cleanup batch failed: {e}");
                break;
            }
        }
    }
    // 删除完成后逐源重算 total_fetched(与手动 delete_wallpaper 同口径)。
    for sid in affected_sources {
        if let Err(e) = sqlx::query(
            "UPDATE wallpaper_sources
                SET total_fetched = (SELECT COUNT(*)::int FROM remote_wallpapers WHERE source_id = $1),
                    updated_at = now()
              WHERE id = $1",
        )
        .bind(sid)
        .execute(&state.pg)
        .await
        {
            tracing::warn!("expired wallpaper total_fetched recount failed for {sid}: {e}");
        }
    }
}

async fn icon_loop(state: Arc<AppState>, shutdown: Arc<AtomicBool>) {
    let interval = Duration::from_secs(3_600);
    let busy = Arc::new(tokio::sync::Mutex::new(()));
    while sleep_or_shutdown(interval, &shutdown).await {
        let Ok(_lock) = busy.try_lock() else {
            tracing::warn!("icon fetch skipped: previous tick still running");
            continue;
        };
        tracing::info!("checking icon sources for scheduled fetch...");
        let sources: Result<Vec<IconAssetSource>, _> = sqlx::query_as(
            "SELECT * FROM icon_asset_sources WHERE enabled = true \
             AND (last_fetched_at IS NULL OR last_fetched_at < now() - (fetch_interval_hours || ' hours')::interval)",
        )
        .fetch_all(&state.pg)
        .await;
        match sources {
            Ok(srcs) => {
                for src in srcs {
                    if shutdown.load(Ordering::Relaxed) {
                        break;
                    }
                    tracing::info!("scheduled fetch for icon source '{}'", src.name);
                    if let Err(e) = icon_asset_sources::run_fetch(&state, &src).await {
                        tracing::error!("icon fetch error '{}': {e}", src.name);
                    }
                }
            }
            Err(e) => tracing::warn!("icon source query failed: {e}"),
        }
        // API-3: 后台过期删除此前不回算来源的 total_fetched(与手动 delete_icon 不一致),
        // 计数只增不减。改为 RETURNING source_id 收集受影响来源,删完后按 COUNT 逐源重算。
        let deleted: Result<Vec<(Option<uuid::Uuid>,)>, _> = sqlx::query_as(
            "DELETE FROM remote_icon_assets WHERE id IN (\
                SELECT id FROM remote_icon_assets \
                WHERE expires_at IS NOT NULL AND expires_at < now() \
                LIMIT 5000\
            ) RETURNING source_id",
        )
        .fetch_all(&state.pg)
        .await;
        match deleted {
            Ok(rows) => {
                let affected: std::collections::HashSet<uuid::Uuid> =
                    rows.into_iter().filter_map(|(sid,)| sid).collect();
                for sid in affected {
                    if let Err(e) = sqlx::query(
                        "UPDATE icon_asset_sources
                            SET total_fetched = (SELECT COUNT(*)::int FROM remote_icon_assets WHERE source_id = $1),
                                updated_at = now()
                          WHERE id = $1",
                    )
                    .bind(sid)
                    .execute(&state.pg)
                    .await
                    {
                        tracing::warn!("expired icon total_fetched recount failed for {sid}: {e}");
                    }
                }
            }
            Err(e) => tracing::warn!("expired icon cleanup failed: {e}"),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // DATA-2: 批大小夹取逻辑。
    #[test]
    fn clamp_batch_floors_zero_and_negative() {
        assert_eq!(clamp_cleanup_batch(0), 1);
        assert_eq!(clamp_cleanup_batch(-100), 1);
        assert_eq!(clamp_cleanup_batch(i64::MIN), 1);
    }

    #[test]
    fn clamp_batch_caps_oversized() {
        assert_eq!(clamp_cleanup_batch(10_000), MESSAGE_CLEANUP_BATCH);
        assert_eq!(clamp_cleanup_batch(i64::MAX), MESSAGE_CLEANUP_BATCH);
    }

    #[test]
    fn clamp_batch_keeps_in_range() {
        assert_eq!(clamp_cleanup_batch(1), 1);
        assert_eq!(clamp_cleanup_batch(2_500), 2_500);
        assert_eq!(
            clamp_cleanup_batch(MESSAGE_CLEANUP_BATCH),
            MESSAGE_CLEANUP_BATCH
        );
    }

    // DATA-4: 孤儿筛选纯逻辑。
    use std::collections::HashSet;
    use uuid::Uuid;

    fn uuid_n(n: u8) -> Uuid {
        Uuid::from_bytes([n; 16])
    }

    #[test]
    fn filters_unreferenced_candidates() {
        let a = uuid_n(1);
        let b = uuid_n(2);
        let c = uuid_n(3);
        let candidates = vec![
            (a, "/uploads/icons/a.png".to_string()),
            (b, "/uploads/icons/b.png".to_string()),
            (c, "/uploads/icons/c.png".to_string()),
        ];
        let mut referenced = HashSet::new();
        referenced.insert("/uploads/icons/b.png".to_string());
        let orphans = filter_orphan_icons(candidates, &referenced);
        // a and c are unreferenced → orphans; b is referenced → kept.
        assert_eq!(orphans, vec![a, c]);
    }

    #[test]
    fn keeps_all_when_all_referenced() {
        let a = uuid_n(1);
        let candidates = vec![(a, "/uploads/icons/a.png".to_string())];
        let mut referenced = HashSet::new();
        referenced.insert("/uploads/icons/a.png".to_string());
        assert!(filter_orphan_icons(candidates, &referenced).is_empty());
    }

    #[test]
    fn all_orphans_when_none_referenced() {
        let a = uuid_n(1);
        let b = uuid_n(2);
        let candidates = vec![
            (a, "/uploads/icons/a.png".to_string()),
            (b, "/uploads/icons/b.png".to_string()),
        ];
        let referenced = HashSet::new();
        assert_eq!(filter_orphan_icons(candidates, &referenced), vec![a, b]);
    }

    #[test]
    fn empty_candidates_yield_empty() {
        let referenced = HashSet::new();
        let candidates: Vec<(Uuid, String)> = Vec::new();
        assert!(filter_orphan_icons(candidates, &referenced).is_empty());
    }
}
