use axum::{
    Json,
    extract::{Query, State},
    http::StatusCode,
};
use serde::{Deserialize, Serialize};

use crate::startup::AppState;

#[derive(Deserialize, Debug)]
#[allow(dead_code)]
pub struct GetTokenQuery {
    email: String,
}

#[derive(Serialize)]
pub struct TokenResponse {
    token: Option<String>,
}

/// Test-only endpoint to get subscription token for a given email
/// This should only be enabled in test mode or e2e-tests feature
#[tracing::instrument(name = "Get subscription token for email (test only)", skip(state))]
pub async fn get_subscription_token_for_email(
    State(state): State<AppState>,
    Query(query): Query<GetTokenQuery>,
) -> Result<Json<TokenResponse>, StatusCode> {
    #[cfg(any(test, feature = "e2e-tests"))]
    {
        let token = sqlx::query_scalar!(
            r#"
            SELECT subscription_token
            FROM subscription_tokens
            WHERE subscriber_id = (
                SELECT id FROM subscriptions WHERE email = $1
            )
            "#,
            query.email
        )
        .fetch_optional(&state.db)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

        Ok(Json(TokenResponse { token }))
    }

    #[cfg(not(any(test, feature = "e2e-tests")))]
    {
        // In non-test builds, always return 404
        let _ = (state, query); // Suppress unused warnings
        Err(StatusCode::NOT_FOUND)
    }
}
