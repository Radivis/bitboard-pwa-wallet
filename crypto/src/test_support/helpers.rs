use crate::configuration::DatabaseSettings;
use crate::telemetry::{get_subscriber, init_subscriber};
use sqlx::{Connection, Executor, PgConnection, PgPool};
use std::sync::{LazyLock, Mutex};
use std::time::Duration;
use tracing_appender::non_blocking::{NonBlocking, WorkerGuard};

// This holds the guard for the entire lifetime of the test process
static LOG_GUARD: Mutex<Option<WorkerGuard>> = Mutex::new(None);

// Ensure that the `tracing` stack is only initialised once using `LazyLock`
pub static TRACING: LazyLock<()> = LazyLock::new(|| {
    let default_filter_level = "info".to_string();
    let subscriber_name = "test".to_string();
    let loglevel = std::env::var("LOGLEVEL").unwrap_or(default_filter_level);

    if std::env::var("TEST_LOG").is_ok() {
        let subscriber = get_subscriber(subscriber_name, loglevel, std::io::stdout);
        init_subscriber(subscriber);
    } else {
        let subscriber = get_subscriber(subscriber_name, loglevel, test_writer());
        init_subscriber(subscriber);
    }
});

pub fn test_writer() -> NonBlocking {
    let test_name = std::env::args()
        .skip_while(|arg| arg != "--exact")
        .nth(1)
        .map(|arg| arg.replace("::", "-").to_string())
        .unwrap_or("unlabeled_test".into())
        .replace(' ', "_");

    let _ = std::fs::create_dir_all("tests/logs");
    let _ = std::fs::create_dir_all("tests/logs/nextest");
    let _ = std::fs::create_dir_all("tests/logs/cargo_test");

    let filename = if test_name != "unlabeled_test" {
        format!("tests/logs/nextest/{}.log", test_name)
    } else {
        "tests/logs/cargo_test/cargo_test.log".to_string()
    };

    let file_appender = tracing_appender::rolling::never(".", filename);
    let (non_blocking, guard) = tracing_appender::non_blocking(file_appender);

    // Store the guard to prevent it from being dropped
    *LOG_GUARD.lock().unwrap() = Some(guard);

    non_blocking
}

pub async fn configure_database(config: &DatabaseSettings) -> PgPool {
    // Safety check: only allow dropping test databases
    assert!(
        config.database_name.starts_with("test-"),
        "Safety check failed: configure_database should only be used with test databases (name must start with 'test-')"
    );

    // Use the postgres maintenance database with the same credentials
    // In test environments, these credentials are configured via configuration files
    let maintenance_settings = DatabaseSettings {
        database_name: "postgres".to_string(),
        ..config.clone()
    };

    // Connect to maintenance database with exponential backoff retry logic
    let mut connection = {
        let max_retries = 5;
        let mut last_error = None;
        let mut connection = None;

        for attempt in 1..=max_retries {
            match PgConnection::connect_with(&maintenance_settings.connect_options()).await {
                Ok(conn) => {
                    connection = Some(conn);
                    break;
                }
                Err(e) => {
                    last_error = Some(e);
                    if attempt < max_retries {
                        let delay_ms = 50 * (1 << (attempt - 1));
                        tracing::debug!(
                            "Failed to connect to maintenance database (attempt {}/{}), retrying in {}ms",
                            attempt,
                            max_retries,
                            delay_ms
                        );
                        tokio::time::sleep(Duration::from_millis(delay_ms)).await;
                    }
                }
            }
        }

        connection.unwrap_or_else(|| {
            panic!(
                "Failed to connect to Postgres after {} retries: {:?}",
                max_retries, last_error
            )
        })
    };

    // Terminate all connections to the database before dropping it
    connection
        .execute(
            format!(
                r#"
                SELECT pg_terminate_backend(pg_stat_activity.pid)
                FROM pg_stat_activity
                WHERE pg_stat_activity.datname = '{}'
                  AND pid <> pg_backend_pid();
                "#,
                config.database_name
            )
            .as_str(),
        )
        .await
        .expect("Failed to terminate connections");

    // Drop database from previous test
    connection
        .execute(format!(r#"DROP DATABASE IF EXISTS "{}";"#, config.database_name).as_str())
        .await
        .expect("Failed to drop database.");

    // Create database
    connection
        .execute(format!(r#"CREATE DATABASE "{}";"#, config.database_name).as_str())
        .await
        .expect("Failed to create database.");

    // Close maintenance connection
    drop(connection);

    // Connect to the new database with exponential backoff retry logic
    let connection_pool = {
        let max_retries = 5;
        let mut last_error = None;
        let mut pool = None;

        for attempt in 1..=max_retries {
            match PgPool::connect_with(config.connect_options()).await {
                Ok(p) => {
                    pool = Some(p);
                    break;
                }
                Err(e) => {
                    last_error = Some(e);
                    if attempt < max_retries {
                        let delay_ms = 50 * (1 << (attempt - 1));
                        tracing::debug!(
                            "Failed to connect to test database (attempt {}/{}), retrying in {}ms",
                            attempt,
                            max_retries,
                            delay_ms
                        );
                        tokio::time::sleep(Duration::from_millis(delay_ms)).await;
                    }
                }
            }
        }

        pool.unwrap_or_else(|| {
            panic!(
                "Failed to connect to test database after {} retries: {:?}",
                max_retries, last_error
            )
        })
    };

    // Run migrations with exponential backoff retry logic
    {
        let max_retries = 5;
        let mut last_error = None;
        let mut migration_success = false;

        for attempt in 1..=max_retries {
            match sqlx::migrate!("./migrations").run(&connection_pool).await {
                Ok(_) => {
                    migration_success = true;
                    break;
                }
                Err(e) => {
                    last_error = Some(e);
                    if attempt < max_retries {
                        let delay_ms = 50 * (1 << (attempt - 1));
                        tracing::debug!(
                            "Failed to run migrations (attempt {}/{}), retrying in {}ms",
                            attempt,
                            max_retries,
                            delay_ms
                        );
                        tokio::time::sleep(Duration::from_millis(delay_ms)).await;
                    }
                }
            }
        }

        if !migration_success {
            panic!(
                "Failed to migrate the database after {} retries: {:?}",
                max_retries, last_error
            );
        }
    }

    connection_pool
}
