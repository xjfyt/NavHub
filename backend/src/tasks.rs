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
        // reason as audit_log.
        let _ = sqlx::query(
            "DELETE FROM remote_wallpapers WHERE id IN (\
                SELECT id FROM remote_wallpapers \
                WHERE expires_at IS NOT NULL AND expires_at < now() \
                LIMIT 5000\
            )",
        )
        .execute(&state.pg)
        .await;
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
