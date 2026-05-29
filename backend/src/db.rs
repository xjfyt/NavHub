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

    // API-7: 启动期迁移完整性检查。检测「磁盘上重复的版本号」与「已记录 checksum
    // 与磁盘文件不一致(被静默编辑/改名)」两类隐患。生产环境直接 FAIL 启动;开发
    // 环境仅 warn 以便迭代。检测逻辑下沉为纯函数 check_migration_integrity 便于测试。
    let recorded: Vec<(i64, Vec<u8>)> = sqlx::query_as::<_, (i64, Vec<u8>)>(
        "SELECT version, checksum FROM _sqlx_migrations",
    )
    .fetch_all(&mut *conn)
    .await?;

    let on_disk: Vec<(i64, &[u8])> = MIGRATOR
        .iter()
        .map(|m| (m.version, m.checksum.as_ref()))
        .collect();

    if let Err(problems) = check_migration_integrity(&on_disk, &recorded) {
        let summary = problems.join("; ");
        let dev = is_dev_migration_mode();
        if dev {
            tracing::warn!("migration integrity check found issues (dev mode, continuing): {summary}");
        } else {
            anyhow::bail!("migration integrity check failed: {summary}");
        }
    }

    let applied: HashSet<i64> = recorded.iter().map(|(v, _)| *v).collect();

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

/// API-7: 是否处于「开发」迁移模式。debug 构建或显式 NAVHUB_DEV=1 视为开发;
/// 与 main::is_dev_mode 同源,但 db 层独立判定避免循环依赖。
fn is_dev_migration_mode() -> bool {
    cfg!(debug_assertions) || std::env::var("NAVHUB_DEV").ok().as_deref() == Some("1")
}

/// API-7: 纯函数 —— 检测迁移完整性问题。返回 `Err(problems)` 列出所有问题:
///   1. 磁盘上存在重复的版本号(同一 version 出现多次);
///   2. 数据库已记录的某版本 checksum 与磁盘上同版本文件的 checksum 不一致
///      (说明已应用的迁移被静默编辑/改名)。
///
/// 数据库中记录、但磁盘上已不存在的版本不视为错误(可能是历史迁移已被清理/压缩)。
/// 全部一致时返回 `Ok(())`。
fn check_migration_integrity(
    on_disk: &[(i64, &[u8])],
    recorded: &[(i64, Vec<u8>)],
) -> Result<(), Vec<String>> {
    let mut problems: Vec<String> = Vec::new();

    // 1. 磁盘重复版本号。
    let mut seen: HashSet<i64> = HashSet::new();
    let mut dup_reported: HashSet<i64> = HashSet::new();
    for (v, _) in on_disk {
        if !seen.insert(*v) && dup_reported.insert(*v) {
            problems.push(format!("duplicate on-disk migration version {v}"));
        }
    }

    // 2. 已记录 checksum 与磁盘同版本不一致。
    use std::collections::HashMap;
    let disk_map: HashMap<i64, &[u8]> = on_disk.iter().map(|(v, c)| (*v, *c)).collect();
    for (v, rec_checksum) in recorded {
        if let Some(disk_checksum) = disk_map.get(v) {
            if *disk_checksum != rec_checksum.as_slice() {
                problems.push(format!(
                    "checksum mismatch for migration version {v} (on-disk file differs from applied record)"
                ));
            }
        }
    }

    if problems.is_empty() {
        Ok(())
    } else {
        Err(problems)
    }
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

#[cfg(test)]
mod tests {
    use super::check_migration_integrity;

    #[test]
    fn integrity_all_consistent_ok() {
        let on_disk: Vec<(i64, &[u8])> = vec![(1, b"aaa"), (2, b"bbb"), (3, b"ccc")];
        let recorded = vec![(1, b"aaa".to_vec()), (2, b"bbb".to_vec())];
        assert!(check_migration_integrity(&on_disk, &recorded).is_ok());
    }

    #[test]
    fn integrity_duplicate_version_errors() {
        let on_disk: Vec<(i64, &[u8])> = vec![(1, b"aaa"), (2, b"bbb"), (2, b"bbb2")];
        let recorded: Vec<(i64, Vec<u8>)> = vec![];
        let err = check_migration_integrity(&on_disk, &recorded).unwrap_err();
        assert!(err.iter().any(|p| p.contains("duplicate") && p.contains('2')));
    }

    #[test]
    fn integrity_checksum_mismatch_errors() {
        // 磁盘上版本 2 的 checksum 与已记录的不同 → 已应用迁移被静默编辑。
        let on_disk: Vec<(i64, &[u8])> = vec![(1, b"aaa"), (2, b"EDITED")];
        let recorded = vec![(1, b"aaa".to_vec()), (2, b"bbb".to_vec())];
        let err = check_migration_integrity(&on_disk, &recorded).unwrap_err();
        assert!(err.iter().any(|p| p.contains("checksum mismatch") && p.contains('2')));
    }

    #[test]
    fn integrity_recorded_but_missing_on_disk_is_ok() {
        // 历史迁移已从磁盘清理/压缩,数据库仍有记录 —— 不算错误。
        let on_disk: Vec<(i64, &[u8])> = vec![(2, b"bbb")];
        let recorded = vec![(1, b"aaa".to_vec()), (2, b"bbb".to_vec())];
        assert!(check_migration_integrity(&on_disk, &recorded).is_ok());
    }

    #[test]
    fn integrity_new_unapplied_migration_is_ok() {
        // 磁盘上有新版本 3 尚未记录 —— 正常待应用,不算错误。
        let on_disk: Vec<(i64, &[u8])> = vec![(1, b"aaa"), (2, b"bbb"), (3, b"ccc")];
        let recorded = vec![(1, b"aaa".to_vec()), (2, b"bbb".to_vec())];
        assert!(check_migration_integrity(&on_disk, &recorded).is_ok());
    }

    #[test]
    fn integrity_reports_multiple_problems() {
        let on_disk: Vec<(i64, &[u8])> = vec![(1, b"aaa"), (1, b"dup"), (2, b"EDITED")];
        let recorded = vec![(2, b"bbb".to_vec())];
        let err = check_migration_integrity(&on_disk, &recorded).unwrap_err();
        assert_eq!(err.len(), 2);
    }
}
