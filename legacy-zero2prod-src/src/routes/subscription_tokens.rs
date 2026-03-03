//! Shared types and utilities for subscription token-based operations.
//! Used by both confirm and unsubscribe flows.

use crate::routes::constants::ERROR_SOMETHING_WENT_WRONG;
use crate::telemetry::error_chain_fmt;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use uuid::Uuid;

#[derive(serde::Deserialize, utoipa::IntoParams)]
pub struct SubscriptionTokenParameters {
    /// Subscription token received via email (confirm or unsubscribe link)
    pub subscription_token: String,
}

#[derive(thiserror::Error)]
pub enum TokenError {
    #[error("Malformed subscription token")]
    InvalidTokenFormat,
    #[error("Invalid or expired subscription token")]
    InvalidToken,
    #[error(transparent)]
    UnexpectedError(#[from] anyhow::Error),
}

impl std::fmt::Debug for TokenError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        error_chain_fmt(self, f)
    }
}

impl IntoResponse for TokenError {
    fn into_response(self) -> axum::response::Response {
        let (status, body) = match self {
            TokenError::InvalidTokenFormat => (StatusCode::BAD_REQUEST, self.to_string()),
            TokenError::InvalidToken => (StatusCode::UNAUTHORIZED, self.to_string()),
            TokenError::UnexpectedError(_) => {
                // Use generic message to avoid leaking internal error details
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    ERROR_SOMETHING_WENT_WRONG.to_string(),
                )
            }
        };
        (status, body).into_response()
    }
}

#[tracing::instrument(name = "Get subscriber_id from token", skip(subscription_token, db))]
pub async fn get_subscriber_id_from_token(
    db: &sqlx::PgPool,
    subscription_token: &str,
) -> Result<Option<Uuid>, sqlx::Error> {
    let result = sqlx::query!(
        "SELECT subscriber_id FROM subscription_tokens \
        WHERE subscription_token = $1",
        subscription_token,
    )
    .fetch_optional(db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to execute query: {:?}", e);
        e
    })?;
    Ok(result.map(|r| r.subscriber_id))
}

#[tracing::instrument(name = "Get subscriber email from token", skip(subscription_token, db))]
pub async fn get_subscriber_email_from_token(
    db: &sqlx::PgPool,
    subscription_token: &str,
) -> Result<Option<String>, sqlx::Error> {
    let result = sqlx::query!(
        r#"
        SELECT s.email
        FROM subscriptions s
        JOIN subscription_tokens st ON s.id = st.subscriber_id
        WHERE st.subscription_token = $1
        "#,
        subscription_token,
    )
    .fetch_optional(db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to execute query: {:?}", e);
        e
    })?;
    Ok(result.map(|r| r.email))
}
