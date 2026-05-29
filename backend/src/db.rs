use crate::config::DatabaseConfig;
use sqlx::migrate::{Migrate, Migrator};
use sqlx::postgres::{PgConnectOptions, PgPoolOptions};
use sqlx::{ConnectOptions, PgPool};
use std::collections::HashSet;
use std::str::FromStr;
use std::time::Duration;

static MIGRATOR: Migrator = sqlx::migrate!("./migrations");

pub async fn connect(cfg: &DatabaseConfig) -> anyhow::Result<PgPool> {
    ensure_database(cfg).await?;

    let mut opts = PgConnectOptions::from_str(&cfg.dsn())?;
    // DATA-1: 关闭 SQLx 语句日志。在 Debug 级别它会打印 SQL 文本及绑定参数,
    // 可能泄露密码 hash、邮箱等 PII;慢查询日志同样含参数,一并关闭。
    opts = opts
        .log_statements(tracing::log::LevelFilter::Off)
        .log_slow_statements(tracing::log::LevelFilter::Off, Duration::from_secs(0));

    let pool = PgPoolOptions::new()
        .max_connections(cfg.max_connections)
        .min_connections(1)
        .acquire_timeout(Duration::from_secs(10))
        .idle_timeout(Some(Duration::from_secs(300)))
        .max_lifetime(Some(Duration::from_secs(1800)))
        .test_before_acquire(true)
        .connect_with(opts)
        .await?;

    apply_migrations(&pool).await?;
    Ok(pool)
}

/// Apply migrations leniently: skip any version already recorded in
/// `_sqlx_migrations`, otherwise apply normally. This deliberately deviates
/// from `Migrator::run`'s strict behaviour where:
///   - editing an already-applied migration file → "previously applied but
///     has been modified" → server refuses to start
///   - two on-disk files sharing a numeric version → duplicate-key error on
///     the second insert → server refuses to start
/// We trade some checksum safety for upgrade robustness: once a version is
/// installed we trust the database. New versions still go through the normal
/// transactional apply path (SQL + bookkeeping row in one tx).
async fn apply_migrations(pool: &PgPool) -> anyhow::Result<()> {
    let mut conn = pool.acquire().await?;
    conn.ensure_migrations_table().await?;

    let applied: HashSet<i64> = sqlx::query_scalar::<_, i64>(
        "SELECT version FROM _sqlx_migrations",
    )
    .fetch_all(&mut *conn)
    .await?
    .into_iter()
    .collect();

    let mut seen_on_disk: HashSet<i64> = HashSet::new();
    for m in MIGRATOR.iter() {
        if applied.contains(&m.version) {
            tracing::debug!(
                "migration {} ({}) already applied, skipping",
                m.version, m.description
            );
            continue;
        }
        if !seen_on_disk.insert(m.version) {
            tracing::warn!(
                "duplicate on-disk migration version {} ({}), skipping (first instance wins this run)",
                m.version, m.description
            );
            continue;
        }
        tracing::info!(
            "applying migration {} ({})",
            m.version, m.description
        );
        conn.apply(m).await?;
    }
    Ok(())
}

async fn ensure_database(cfg: &DatabaseConfig) -> anyhow::Result<()> {
    use sqlx::postgres::PgConnection;
    use sqlx::Connection;

    // Try connecting to target DB; if it fails with "database does not exist", create it
    match PgConnection::connect(&cfg.dsn()).await {
        Ok(c) => {
            let _ = c.close().await;
            Ok(())
        }
        Err(e) => {
            let msg = e.to_string();
            if msg.contains("does not exist") || msg.contains("3D000") {
                tracing::info!("database {} missing; creating...", cfg.database);
                let mut admin = PgConnection::connect(&cfg.admin_dsn()).await?;
                let sql = format!("CREATE DATABASE \"{}\"", cfg.database.replace('"', "\"\""));
                sqlx::query(&sql).execute(&mut admin).await?;
                let _ = admin.close().await;
                Ok(())
            } else {
                Err(e.into())
            }
        }
    }
}
