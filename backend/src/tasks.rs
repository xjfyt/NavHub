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
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
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
            tracing::warn!("background workers did not drain within {:?}, abandoning", timeout);
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
async fn expire_wallpapers(state: &Arc<AppState>, shutdown: &AtomicBool) {
    loop {
        if shutdown.load(Ordering::Relaxed) {
            break;
        }
        let rows: Result<Vec<(Option<String>, Option<String>)>, _> = sqlx::query_as(
            "DELETE FROM remote_wallpapers WHERE id IN (\
                SELECT id FROM remote_wallpapers \
                WHERE expires_at IS NOT NULL AND expires_at < now() \
                LIMIT 5000\
            ) RETURNING storage_key, thumbnail_key",
        )
        .fetch_all(&state.pg)
        .await;
        match rows {
            Ok(r) if r.is_empty() => break,
            Ok(r) => {
                let keys = wallpapers::collect_wallpaper_keys(
                    r.iter().map(|(s, t)| (s.as_deref(), t.as_deref())),
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
        let _ = sqlx::query(
            "DELETE FROM remote_icon_assets WHERE id IN (\
                SELECT id FROM remote_icon_assets \
                WHERE expires_at IS NOT NULL AND expires_at < now() \
                LIMIT 5000\
            )",
        )
        .execute(&state.pg)
        .await;
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
        assert_eq!(clamp_cleanup_batch(MESSAGE_CLEANUP_BATCH), MESSAGE_CLEANUP_BATCH);
    }
}
