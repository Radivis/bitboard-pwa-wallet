use super::helpers::{ConfirmationLinks, configure_database};
use argon2::{Algorithm, Argon2, Params, PasswordHasher, Version, password_hash::SaltString};
use linkify::LinkFinder;
use sqlx::PgPool;
use std::sync::LazyLock;
use uuid::Uuid;
use wiremock::MockServer;
use zero2prod::configuration::get_configuration;
use zero2prod::email_client::EmailClient;
use zero2prod::issue_delivery_worker::{ExecutionOutcome, try_execute_task};
use zero2prod::startup::Application;

#[derive(Debug)]
pub struct TestApp {
    pub address: String,
    pub port: u16,
    pub db_connection_pool: PgPool,
    pub email_client: EmailClient,
    pub email_server: MockServer,
    pub api_client: reqwest::Client,
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

    async fn store(&self, pool: &PgPool) {
        let salt = SaltString::generate(&mut rand::thread_rng());
        // Match parameters of the default password
        let password_hash = Argon2::new(
            Algorithm::Argon2id,
            Version::V0x13,
            Params::new(15000, 2, 1, None).unwrap(),
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

pub struct TestAppContainerWithUser {
    pub app: TestApp,
    pub test_user: TestUser,
}

impl TestAppContainerWithUser {
    pub async fn login(self) -> Self {
        let response = self
            .app
            .post_login_json(&serde_json::json!({
                "username": self.test_user.username,
                "password": self.test_user.password
            }))
            .await;
        assert_eq!(response.status().as_u16(), 200);
        let login_body: serde_json::Value = response
            .json()
            .await
            .expect("Failed to parse login response");
        assert!(login_body["success"].as_bool().unwrap());
        self
    }
}

impl TestApp {
    pub async fn dispatch_all_pending_emails(&self) {
        loop {
            if let ExecutionOutcome::EmptyQueue =
                try_execute_task(&self.db_connection_pool, &self.email_client, &self.address)
                    .await
                    .unwrap()
            {
                break;
            }
        }
    }

    pub async fn post_logout(&self) -> reqwest::Response {
        self.api_client
            .post(format!("{}/api/admin/logout", &self.address))
            .send()
            .await
            .expect("Failed to execute request.")
    }

    pub async fn post_change_password<Body>(&self, body: &Body) -> reqwest::Response
    where
        Body: serde::Serialize,
    {
        self.api_client
            .post(format!("{}/api/admin/password", &self.address))
            .json(body)
            .send()
            .await
            .expect("Failed to execute request.")
    }

    pub async fn post_login_json<Body>(&self, body: &Body) -> reqwest::Response
    where
        Body: serde::Serialize,
    {
        self.api_client
            .post(format!("{}/api/login", &self.address))
            .json(body)
            .send()
            .await
            .expect("Failed to execute request.")
    }

    pub async fn post_initial_password<Body>(&self, body: &Body) -> reqwest::Response
    where
        Body: serde::Serialize,
    {
        self.api_client
            .post(format!("{}/api/initial_password", &self.address))
            .json(body)
            .send()
            .await
            .expect("Failed to execute request.")
    }

    pub async fn get_users_exist(&self) -> reqwest::Response {
        self.api_client
            .get(format!("{}/api/users/exists", &self.address))
            .send()
            .await
            .expect("Failed to execute request.")
    }

    pub async fn post_newsletters<Body>(&self, body: &Body) -> reqwest::Response
    where
        Body: serde::Serialize,
    {
        self.api_client
            .post(format!("{}/api/admin/newsletters", &self.address))
            .json(body)
            .send()
            .await
            .expect("Failed to execute request.")
    }

    pub async fn post_subscriptions<Body>(&self, body: &Body) -> reqwest::Response
    where
        Body: serde::Serialize,
    {
        self.api_client
            .post(format!("{}/api/subscriptions", &self.address))
            .json(body)
            .send()
            .await
            .expect("Failed to execute request.")
    }

    pub fn get_unsubscribe_url(&self, subscription_token: &str) -> String {
        format!(
            "{}/api/subscriptions/unsubscribe?subscription_token={}",
            self.address, subscription_token
        )
    }

    pub async fn get_unsubscribe_info(&self, subscription_token: &str) -> reqwest::Response {
        reqwest::get(self.get_unsubscribe_url(subscription_token))
            .await
            .expect("Failed to execute request.")
    }

    pub async fn post_unsubscribe(&self, subscription_token: &str) -> reqwest::Response {
        self.api_client
            .post(self.get_unsubscribe_url(subscription_token))
            .send()
            .await
            .expect("Failed to execute request.")
    }

    #[cfg(feature = "e2e-tests")]
    pub async fn get_test_token(&self, email: &str) -> reqwest::Response {
        self.api_client
            .get(format!("{}/api/test/subscription-token", self.address))
            .query(&[("email", email)])
            .send()
            .await
            .expect("Failed to execute request.")
    }

    // Blog public endpoints
    pub async fn get_published_posts(&self) -> reqwest::Response {
        self.api_client
            .get(format!("{}/api/blog/posts", &self.address))
            .send()
            .await
            .expect("Failed to execute request.")
    }

    pub async fn get_post_by_id(&self, post_id: Uuid) -> reqwest::Response {
        self.api_client
            .get(format!("{}/api/blog/posts/{}", &self.address, post_id))
            .send()
            .await
            .expect("Failed to execute request.")
    }

    // Blog admin endpoints
    pub async fn admin_get_all_posts(&self) -> reqwest::Response {
        self.api_client
            .get(format!("{}/api/admin/blog/posts", &self.address))
            .send()
            .await
            .expect("Failed to execute request.")
    }

    pub async fn admin_get_post_by_id(&self, post_id: Uuid) -> reqwest::Response {
        self.api_client
            .get(format!(
                "{}/api/admin/blog/posts/{}",
                &self.address, post_id
            ))
            .send()
            .await
            .expect("Failed to execute request.")
    }

    pub async fn admin_create_post<Body>(&self, body: &Body) -> reqwest::Response
    where
        Body: serde::Serialize,
    {
        self.api_client
            .post(format!("{}/api/admin/blog/posts", &self.address))
            .json(body)
            .send()
            .await
            .expect("Failed to execute request.")
    }

    pub async fn admin_update_post<Body>(&self, post_id: Uuid, body: &Body) -> reqwest::Response
    where
        Body: serde::Serialize,
    {
        self.api_client
            .put(format!(
                "{}/api/admin/blog/posts/{}",
                &self.address, post_id
            ))
            .json(body)
            .send()
            .await
            .expect("Failed to execute request.")
    }

    pub async fn admin_delete_post(&self, post_id: Uuid) -> reqwest::Response {
        self.api_client
            .delete(format!(
                "{}/api/admin/blog/posts/{}",
                &self.address, post_id
            ))
            .send()
            .await
            .expect("Failed to execute request.")
    }

    /// Extract the confirmation links embedded in the request to the email API.
    pub fn get_confirmation_links(&self, email_request: &wiremock::Request) -> ConfirmationLinks {
        let body: serde_json::Value = serde_json::from_slice(&email_request.body).unwrap();
        // Extract the link from one of the request fields.
        let get_link = |s: &str| {
            let links: Vec<_> = LinkFinder::new()
                .links(s)
                .filter(|l| *l.kind() == linkify::LinkKind::Url)
                .collect();
            // We expect at least one link (could be more for UX, e.g., button + fallback text)
            assert!(
                !links.is_empty(),
                "Expected at least one link in email body"
            );
            let raw_link = links[0].as_str().to_owned();
            let mut confirmation_link = reqwest::Url::parse(&raw_link).unwrap();
            // Let's make sure we don't call random APIs on the web
            assert_eq!(confirmation_link.host_str().unwrap(), "127.0.0.1");
            confirmation_link.set_port(Some(self.port)).unwrap();
            confirmation_link
        };

        let html = get_link(body["HtmlBody"].as_str().unwrap());
        let plain_text = get_link(body["TextBody"].as_str().unwrap());
        ConfirmationLinks { html, plain_text }
    }

    pub async fn make_container_with_user(self) -> TestAppContainerWithUser {
        let test_user = TestUser::generate();
        test_user.store(&self.db_connection_pool).await;
        TestAppContainerWithUser {
            app: self,
            test_user,
        }
    }
}

#[tracing::instrument(name = "Spawning test application", skip_all)]
pub async fn spawn_app(test_name: impl AsRef<str>) -> TestApp {
    let test_name = test_name.as_ref();
    // The first time `initialize` is invoked the code in `TRACING` is executed.
    // All other invocations will instead skip execution.
    LazyLock::force(&super::helpers::TRACING);

    // Launch a mock server to stand in for Postmark's API
    let email_server = MockServer::start().await;

    // Randomise configuration to ensure test isolation
    let configuration = {
        let mut c = get_configuration().expect("Failed to read configuration.");
        // Use a different database for each test case
        c.database.database_name = format!("test-{}", test_name);
        // Use a random OS port
        c.application.port = 0;
        c.email_client.base_url = email_server.uri();

        // Use a unique Redis database to prevent session conflicts between parallel tests
        // Hash the test name to get a Redis DB index (0-15)
        use secrecy::ExposeSecret;
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

    // Notice the .clone!
    let application = Application::build(configuration.clone())
        .await
        .expect("Failed to build application.");
    let address = format!("http://127.0.0.1:{}", application.port());
    let port = application.port();

    #[allow(clippy::let_underscore_future)]
    let _ = tokio::spawn(application.run_until_stopped(configuration.clone()));

    let api_client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .cookie_store(true)
        .build()
        .unwrap();

    TestApp {
        address,
        port,
        db_connection_pool,
        email_client: configuration.email_client.client(),
        email_server,
        api_client,
    }
}

#[tracing::instrument(name = "Spawning test application with user", skip_all)]
pub async fn spawn_app_container_with_user(test_name: impl AsRef<str>) -> TestAppContainerWithUser {
    spawn_app(test_name).await.make_container_with_user().await
}
