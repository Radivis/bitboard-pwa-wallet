use axum::Router;
use axum::routing::{get, post};
use secrecy::{ExposeSecret, Secret};
use sqlx::PgPool;
use sqlx::postgres::PgPoolOptions;
use std::net::TcpListener;
use tower_http::services::{ServeDir, ServeFile};
use tower_http::trace::TraceLayer;
use tower_sessions::SessionManagerLayer;
use tower_sessions_redis_store::{RedisStore, fred::prelude::*};
use utoipa::OpenApi;

use crate::authentication::UserId;
use crate::configuration::{DatabaseSettings, Settings};
use crate::email_client::EmailClient;
use crate::routes::admin::{
    admin_create_post, admin_delete_post, admin_get_all_posts, admin_get_post_by_id,
    admin_update_post,
};
use crate::routes::blog::{get_post_by_id, get_published_posts};
use crate::routes::constants::ERROR_AUTHENTICATION_REQUIRED;
use crate::routes::{
    auth_check_endpoint, change_password, check_users_exist_endpoint, confirm, confirm_unsubscribe,
    create_initial_password, get_unsubscribe_info, health_check, log_out, login,
    publish_newsletter, subscribe,
};
use axum::extract::FromRequestParts;
use axum::extract::Request;
use axum::http::StatusCode;
use axum::middleware::Next;
use axum::response::{IntoResponse, Json};
use tower_sessions::Expiry;

#[derive(serde::Serialize)]
struct AuthErrorResponse {
    success: bool,
    error: String,
}

pub fn get_connection_pool(db_configuration: &DatabaseSettings) -> PgPool {
    PgPoolOptions::new().connect_lazy_with(db_configuration.connect_options())
}

#[derive(Clone)]
pub struct AppState {
    pub db: PgPool,
    pub email_client: EmailClient,
    pub base_url: ApplicationBaseUrl,
    pub hmac_secret: HmacSecret,
}

pub struct Application {
    port: u16,
    listener: TcpListener,
}

#[derive(Clone)]
pub struct HmacSecret(pub Secret<String>);

// We need to define a wrapper type in order to retrieve the URL
// in the `subscribe` handler.
// Retrieval from the context, in actix-web, is type-based: using
// a raw `String` would expose us to conflicts.
#[derive(Clone)]
pub struct ApplicationBaseUrl(pub String);

impl Application {
    pub async fn build(configuration: Settings) -> Result<Self, anyhow::Error> {
        let _connection_pool = get_connection_pool(&configuration.database);
        let _email_client = configuration.email_client.client();
        let address = format!(
            "{}:{}",
            configuration.application.host, configuration.application.port
        );
        let listener = TcpListener::bind(address)?;
        listener.set_nonblocking(true)?; // Set listener to non-blocking
        let port = listener.local_addr()?.port();

        Ok(Self { port, listener })
    }

    pub fn port(&self) -> u16 {
        self.port
    }

    pub async fn run_until_stopped(self, configuration: Settings) -> Result<(), std::io::Error> {
        let connection_pool = get_connection_pool(&configuration.database);

        sqlx::migrate!("./migrations")
            .run(&connection_pool)
            .await
            .map_err(|e| {
                std::io::Error::other(format!("Failed to run database migrations: {e}"))
            })?;
        tracing::info!("Database migrations completed successfully");

        let email_client = configuration.email_client.client();
        let app_state = AppState {
            db: connection_pool,
            email_client,
            base_url: ApplicationBaseUrl(configuration.application.base_url),
            hmac_secret: HmacSecret(configuration.application.hmac_secret),
        };

        // Set up RedisStore with fred (compatible with both Redis and Valkey)
        let redis_url = configuration.redis_uri.expose_secret();
        let redis_config = Config::from_url(redis_url.as_str())
            .map_err(|e| std::io::Error::other(format!("Invalid Redis URL: {}", e)))?;

        let pool = Pool::new(redis_config, None, None, None, 6)
            .map_err(|e| std::io::Error::other(format!("Failed to create Redis pool: {}", e)))?;

        pool.connect();
        pool.wait_for_connect()
            .await
            .map_err(|e| std::io::Error::other(format!("Failed to connect to Redis: {}", e)))?;

        let session_store = RedisStore::new(pool);
        let is_production = std::env::var("APP_ENVIRONMENT")
            .map(|env| env == "production")
            .unwrap_or(false);
        let session_layer = SessionManagerLayer::new(session_store)
            .with_secure(is_production)
            .with_expiry(Expiry::OnInactivity(
                tower_sessions::cookie::time::Duration::hours(1),
            ));

        // Define OpenAPI specification
        #[derive(OpenApi)]
        #[openapi(
            info(
                title = "Zero2Prod API",
                version = "1.0.0",
                description = "Newsletter subscription and blog management API"
            ),
            paths(
                // Health check
                crate::routes::health_check::health_check,
                // Authentication & users
                crate::routes::login::post::login,
                crate::routes::initial_password::post::create_initial_password,
                crate::routes::users::auth_check::auth_check_endpoint,
                crate::routes::users::check_exists::check_users_exist_endpoint,
                // Subscriptions
                crate::routes::subscribe,
                crate::routes::subscriptions_confirm::confirm,
                crate::routes::subscriptions_unsubscribe::get_unsubscribe_info,
                crate::routes::subscriptions_unsubscribe::confirm_unsubscribe,
                // Public blog
                crate::routes::blog::get_published_posts,
                crate::routes::blog::get_post_by_id,
                // Admin endpoints
                crate::routes::admin::logout::log_out,
                crate::routes::admin::password::post::change_password,
                crate::routes::admin::newsletters::post::publish_newsletter,
                // Admin blog
                crate::routes::admin::blog::admin_get_all_posts,
                crate::routes::admin::blog::admin_get_post_by_id,
                crate::routes::admin::blog::admin_create_post,
                crate::routes::admin::blog::admin_update_post,
                crate::routes::admin::blog::admin_delete_post,
            ),
            tags(
                (name = "health", description = "Health check endpoint"),
                (name = "authentication", description = "Authentication and user management"),
                (name = "subscriptions", description = "Newsletter subscription management"),
                (name = "blog", description = "Public blog endpoints"),
                (name = "admin", description = "Admin endpoints (authentication required)"),
                (name = "admin-blog", description = "Admin blog management (authentication required)"),
            )
        )]
        struct ApiDoc;

        // Build API router first
        #[cfg(any(test, feature = "e2e-tests"))]
        let test_routes = Router::new().route(
            "/test/subscription-token",
            get(crate::routes::test_helpers::get_subscription_token_for_email),
        );
        #[cfg(not(any(test, feature = "e2e-tests")))]
        let test_routes = Router::new();

        let api_router = Router::new()
            // Auth & users (no auth required)
            .route("/users/exists", get(check_users_exist_endpoint))
            .route("/auth/me", get(auth_check_endpoint))
            .route("/login", post(login))
            .route("/initial_password", post(create_initial_password))
            // Subscriptions (no auth required)
            .route("/subscriptions", post(subscribe))
            .route("/subscriptions/confirm", get(confirm))
            .route(
                "/subscriptions/unsubscribe",
                get(get_unsubscribe_info).post(confirm_unsubscribe),
            )
            .merge(test_routes)
            // Blog - public endpoints (no auth required)
            .route("/blog/posts", get(get_published_posts))
            .route("/blog/posts/{id}", get(get_post_by_id))
            // Admin endpoints (auth required)
            .nest(
                "/admin",
                Router::new()
                    .route("/newsletters", post(publish_newsletter))
                    .route("/password", post(change_password))
                    .route("/logout", post(log_out))
                    .route("/blog/posts", get(admin_get_all_posts))
                    .route("/blog/posts/{id}", get(admin_get_post_by_id))
                    .route("/blog/posts", post(admin_create_post))
                    .route("/blog/posts/{id}", axum::routing::put(admin_update_post))
                    .route("/blog/posts/{id}", axum::routing::delete(admin_delete_post))
                    .route_layer(axum::middleware::from_fn(require_auth)),
            );

        // Combine all routes
        let app = Router::new()
            .route("/health_check", get(health_check))
            // Subscription confirmation route for email links (redirects to frontend after confirming)
            .route("/subscriptions/confirm", get(confirm))
            // Serve OpenAPI spec as JSON at /api/openapi.json
            .route(
                "/api/openapi.json",
                get(|| async { axum::Json(ApiDoc::openapi()) }),
            )
            // Nest API routes
            .nest("/api", api_router)
            .with_state(app_state)
            .layer(session_layer)
            .layer(TraceLayer::new_for_http());

        let static_dir =
            std::env::var("STATIC_FILES_DIR").unwrap_or_else(|_| "./static".to_string());
        let static_path = std::path::Path::new(&static_dir);
        let app = if static_path.exists() && static_path.is_dir() {
            let index_fallback = ServeFile::new(static_path.join("index.html"));
            let serve_spa = ServeDir::new(&static_dir).not_found_service(index_fallback);
            tracing::info!("Serving static files from {}", static_dir);
            app.fallback_service(serve_spa)
        } else {
            tracing::info!(
                "No static files directory found at {}, skipping SPA serving",
                static_dir
            );
            app
        };

        let listener = tokio::net::TcpListener::from_std(self.listener)?;
        axum::serve(listener, app).await?;
        Ok(())
    }
}

async fn require_auth(req: Request, next: Next) -> axum::response::Response {
    let (mut parts, body) = req.into_parts();
    // All /admin/* routes are API-only, so always return JSON for auth failures
    match UserId::from_request_parts(&mut parts, &()).await {
        Ok(user_id) => {
            parts.extensions.insert(user_id);
            let req = Request::from_parts(parts, body);
            next.run(req).await
        }
        Err(_redirect) => {
            // Return JSON error for API requests (all /admin routes are API-only)
            (
                StatusCode::UNAUTHORIZED,
                Json(AuthErrorResponse {
                    success: false,
                    error: ERROR_AUTHENTICATION_REQUIRED.to_string(),
                }),
            )
                .into_response()
        }
    }
}
