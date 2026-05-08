use crate::config::DatabaseConfig;
use sqlx::postgres::{PgConnectOptions, PgPoolOptions};
use sqlx::{ConnectOptions, PgPool};
use std::str::FromStr;
use std::time::Duration;

pub async fn connect(cfg: &DatabaseConfig) -> anyhow::Result<PgPool> {
    ensure_database(cfg).await?;

    let mut opts = PgConnectOptions::from_str(&cfg.dsn())?;
    opts = opts.log_statements(tracing::log::LevelFilter::Debug);

    let pool = PgPoolOptions::new()
        .max_connections(cfg.max_connections)
        .min_connections(1)
        .acquire_timeout(Duration::from_secs(10))
        .idle_timeout(Some(Duration::from_secs(300)))
        .max_lifetime(Some(Duration::from_secs(1800)))
        .test_before_acquire(true)
        .connect_with(opts)
        .await?;

    sqlx::migrate!("./migrations").run(&pool).await?;
    Ok(pool)
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
