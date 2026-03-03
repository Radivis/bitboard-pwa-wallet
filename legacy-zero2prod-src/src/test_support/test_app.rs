use crate::configuration::get_configuration;
use crate::startup::Application;
use argon2::{Algorithm, Argon2, Params, PasswordHasher, Version, password_hash::SaltString};
use secrecy::ExposeSecret;
use sqlx::PgPool;
use std::sync::LazyLock;
use uuid::Uuid;
use wiremock::MockServer;

use super::helpers::configure_database;

#[derive(Debug)]
pub struct TestApp {
    pub address: String,
    pub port: u16,
    pub db_connection_pool: PgPool,
    pub email_server: MockServer,
}

#[derive(Debug)]
pub struct TestUser {
    pub user_id: Uuid,
    pub username: String,
    pub password: String,
}

impl TestUser {
    pub fn generate() -> Self {
        Self {
            user_id: Uuid::new_v4(),
            username: Uuid::new_v4().to_string(),
            password: Uuid::new_v4().to_string(),
        }
    }

    pub async fn store(&self, pool: &PgPool) {
        let salt = SaltString::generate(&mut rand::thread_rng());
        // Use lighter Argon2 parameters for E2E tests to handle high concurrency
        // Memory: 8MB (vs 15MB), Time: 1 iteration (vs 2) - ~2x faster
        let password_hash = Argon2::new(
            Algorithm::Argon2id,
            Version::V0x13,
            Params::new(8000, 1, 1, None).unwrap(),
        )
        .hash_password(self.password.as_bytes(), &salt)
        .unwrap()
        .to_string();

        sqlx::query!(
            "INSERT INTO users (user_id, username, password_hash)
            VALUES ($1, $2, $3)",
            self.user_id,
            self.username,
            password_hash,
        )
        .execute(pool)
        .await
        .expect("Failed to store test user.");
    }
}

#[tracing::instrument(name = "Spawning test application", skip_all)]
pub async fn spawn_app(test_name: impl AsRef<str>) -> TestApp {
    use super::helpers::TRACING;

    let test_name = test_name.as_ref();
    LazyLock::force(&TRACING);

    let email_server = MockServer::start().await;

    // Mount a default mock for all email requests to allow subscriptions to work
    // in E2E tests without explicitly mounting mocks
    wiremock::Mock::given(wiremock::matchers::path("/email"))
        .and(wiremock::matchers::method("POST"))
        .respond_with(wiremock::ResponseTemplate::new(200))
        .mount(&email_server)
        .await;

    let configuration = {
        let mut c = get_configuration().expect("Failed to read configuration.");
        c.database.database_name = format!("test-{}", test_name);
        c.application.port = 0;
        c.email_client.base_url = email_server.uri();

        // For E2E tests, use a unique Redis database to prevent session conflicts
        // Hash the test name to get a Redis DB index (0-15)
        use std::collections::hash_map::DefaultHasher;
        use std::hash::{Hash, Hasher};
        let mut hasher = DefaultHasher::new();
        test_name.hash(&mut hasher);
        let db_index = (hasher.finish() % 16) as u8;

        let redis_url = c.redis_uri.expose_secret();
        c.redis_uri =
            secrecy::Secret::new(format!("{}/{}", redis_url.trim_end_matches('/'), db_index));

        c
    };

    let db_connection_pool = configure_database(&configuration.database).await;

    let application = Application::build(configuration.clone())
        .await
        .expect("Failed to build application.");
    let address = format!("http://127.0.0.1:{}", application.port());
    let port = application.port();

    #[allow(clippy::let_underscore_future)]
    let _ = tokio::spawn(application.run_until_stopped(configuration.clone()));

    TestApp {
        address,
        port,
        db_connection_pool,
        email_server,
    }
}
