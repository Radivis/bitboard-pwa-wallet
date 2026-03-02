use once_cell::sync::Lazy;
use sqlx::{Connection, Executor, PgConnection, PgPool};
use std::sync::{LazyLock, Mutex};
use std::time::Duration;
use tracing_appender::non_blocking::{NonBlocking, WorkerGuard};
use wiremock::matchers::{method, path};
use wiremock::{Mock, MockServer, ResponseTemplate, Times};

use zero2prod::configuration::DatabaseSettings;
use zero2prod::telemetry::{get_subscriber, init_subscriber};

// This holds the guard for the entire lifetime of the test process
static LOG_GUARD: Lazy<Mutex<Option<WorkerGuard>>> = Lazy::new(|| Mutex::new(None));

// Ensure that the `tracing` stack is only initialised once using `LazyLock`

pub static TRACING: LazyLock<()> = LazyLock::new(|| {
    let default_filter_level = "info".to_string();
    let subscriber_name = "test".to_string();
    let loglevel = std::env::var("LOGLEVEL").unwrap_or(default_filter_level);
    // We cannot assign the output of `get_subscriber` to a variable based on the
    // value TEST_LOG` because the sink is part of the type returned by
    // `get_subscriber`, therefore they are not the same type. We could work around
    // it, but this is the most straight-forward way of moving forward.
    if std::env::var("TEST_LOG").is_ok() {
        let subscriber = get_subscriber(subscriber_name, loglevel, std::io::stdout);
        init_subscriber(subscriber);
    } else {
        let subscriber = get_subscriber(subscriber_name, loglevel, test_writer());
        init_subscriber(subscriber);
    }
});

pub fn test_writer() -> NonBlocking {
    // nextest passes the test name via --exact argument
    // uncomment the next line and run "cargo test" to see how the args are structured:
    // std::env::args().for_each(|arg| println!("Environment argument: {}", arg));
    let test_name = std::env::args()
        .skip_while(|arg| arg != "--exact")
        .nth(1) // we need the first arg exactly after "--exact"
        .map(|arg| arg.replace("::", "-").to_string())
        .unwrap_or("unlabeled_test".into())
        .replace(' ', "_");

    let _ = std::fs::create_dir_all("tests/logs");
    let _ = std::fs::create_dir_all("tests/logs/nextest");
    let _ = std::fs::create_dir_all("tests/logs/cargo_test");
    let filename = if test_name != "unlabeled_test" {
        format!("tests/logs/nextest/{}.log", test_name)
    } else {
        "tests/logs/cargo_test/integration.log".into()
    };
    let file = std::fs::File::create(filename).expect("Failed to create log file");
    let (non_blocking, guard) = tracing_appender::non_blocking(file);

    // Store guard so it lives until process end
    let mut slot = LOG_GUARD.lock().unwrap();
    *slot = Some(guard);

    non_blocking
}

/// Confirmation links embedded in the request to the email API.
pub struct ConfirmationLinks {
    pub html: reqwest::Url,
    pub plain_text: reqwest::Url,
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
    let mut connection = PgConnection::connect_with(&maintenance_settings.connect_options())
        .await
        .expect("Failed to connect to Postgres");

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
    // Migrate database
    let connection_pool = PgPool::connect_with(config.connect_options())
        .await
        .expect("Failed to connect to Postgres.");
    sqlx::migrate!("./migrations")
        .run(&connection_pool)
        .await
        .expect("Failed to migrate the database");
    connection_pool
}

pub async fn mount_mock_email_server(
    email_server: &MockServer,
    request_num_expectation: Option<Times>,
) -> () {
    let mock = Mock::given(path("/email"))
        .and(method("POST"))
        .respond_with(ResponseTemplate::new(200));
    if let Some(num_expected_requests) = request_num_expectation {
        mock.expect(num_expected_requests).mount(email_server).await
    } else {
        mock.mount(email_server).await
    }
}

/// Asserts that a response is a 303 redirect to the subscription confirmation page
pub fn assert_subscription_confirm_redirect(response: &reqwest::Response) {
    assert_eq!(
        response.status().as_u16(),
        303,
        "Expected 303 redirect to /subscribed"
    );
    assert_eq!(
        response
            .headers()
            .get("location")
            .and_then(|v| v.to_str().ok()),
        Some(zero2prod::routes::constants::SUBSCRIPTION_CONFIRMED_REDIRECT_PATH)
    );
}

pub fn assert_is_json_error(response: &reqwest::Response, expected_status: u16) {
    assert_eq!(response.status().as_u16(), expected_status);
    assert_eq!(
        response.headers().get("Content-Type").unwrap(),
        "application/json"
    );
}

pub async fn assert_json_response<T: serde::de::DeserializeOwned>(
    response: reqwest::Response,
) -> T {
    assert_eq!(
        response.headers().get("Content-Type").unwrap(),
        "application/json"
    );
    response
        .json()
        .await
        .expect("Failed to parse JSON response")
}

pub async fn retry<F, Fut, T>(mut f: F, max_retries: u8) -> T
where
    F: FnMut() -> Fut,
    Fut: std::future::Future<Output = Result<T, sqlx::Error>>,
{
    for attempt in 0..max_retries {
        match f().await {
            Ok(value) => return value,
            Err(sqlx::Error::RowNotFound) if attempt < max_retries - 1 => {
                tokio::time::sleep(Duration::from_millis(100)).await; // 100ms backoff
            }
            Err(e) => panic!("{1}: {:?}", e, "Non-RowNotFound error"),
        }
    }
    f().await.expect("Retry exhausted")
}

/// Helper function to create a blog post in the database for testing
pub async fn create_blog_post(
    pool: &PgPool,
    title: &str,
    content: &str,
    status: &str,
    author_id: uuid::Uuid,
) -> uuid::Uuid {
    let post_id = uuid::Uuid::new_v4();
    sqlx::query!(
        r#"
        INSERT INTO blog_posts (id, title, content, status, author_id)
        VALUES ($1, $2, $3, $4, $5)
        "#,
        post_id,
        title,
        content,
        status,
        author_id
    )
    .execute(pool)
    .await
    .expect("Failed to create test blog post");

    post_id
}

/// Helper function to create a confirmed subscriber and return their unsubscribe token
pub async fn create_confirmed_subscriber_with_token(
    app: &super::test_app::TestApp,
    name: &str,
    email: &str,
) -> String {
    let body = serde_json::json!({
        "name": name,
        "email": email
    });

    let _ = mount_mock_email_server(&app.email_server, None).await;

    // Create subscription
    app.post_subscriptions(&body).await;

    // Get confirmation link from email
    let email_request = &app.email_server.received_requests().await.unwrap()[0];
    let confirmation_links = app.get_confirmation_links(email_request);

    // Extract token
    let token = confirmation_links
        .html
        .query_pairs()
        .find(|(key, _)| key == "subscription_token")
        .map(|(_, value)| value.to_string())
        .unwrap();

    // Confirm subscription - use api_client which does not follow redirects
    let response = app
        .api_client
        .get(confirmation_links.html.as_str())
        .send()
        .await
        .unwrap();
    assert_subscription_confirm_redirect(&response);

    token
}
