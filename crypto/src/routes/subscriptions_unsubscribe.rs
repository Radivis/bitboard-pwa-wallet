use crate::routes::subscription_tokens::{
    SubscriptionTokenParameters, TokenError, get_subscriber_email_from_token,
    get_subscriber_id_from_token,
};
use crate::routes::utils::is_valid_uuid_token;
use crate::startup::AppState;
use anyhow::Context;
use axum::extract::{Query, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use uuid::Uuid;

#[derive(serde::Serialize)]
pub struct UnsubscribeInfo {
    email: String,
}

#[tracing::instrument(name = "Delete subscriber", skip(subscriber_id, db))]
pub async fn delete_subscriber(db: &sqlx::PgPool, subscriber_id: Uuid) -> Result<(), sqlx::Error> {
    sqlx::query!(r#"DELETE FROM subscriptions WHERE id = $1"#, subscriber_id,)
        .execute(db)
        .await
        .map_err(|e| {
            tracing::error!("Failed to execute query: {:?}", e);
            e
        })?;
    Ok(())
}

/// Unsubscribe token parameters (re-export for OpenAPI)
pub type Parameters = SubscriptionTokenParameters;

/// Get unsubscribe information
///
/// Returns subscriber email for the given token without actually unsubscribing.
/// This is used by the confirmation page to show whose subscription will be canceled.
#[utoipa::path(
    get,
    path = "/api/subscriptions/unsubscribe",
    tag = "subscriptions",
    params(Parameters),
    responses(
        (status = 200, description = "Token is valid, returns subscriber email"),
        (status = 400, description = "Missing subscription token"),
        (status = 401, description = "Invalid or expired subscription token"),
        (status = 500, description = "Internal server error"),
    )
)]
#[tracing::instrument(name = "Get unsubscribe info", skip(parameters, state))]
pub async fn get_unsubscribe_info(
    State(state): State<AppState>,
    Query(parameters): Query<Parameters>,
) -> Result<impl IntoResponse, TokenError> {
    // Validate token format before querying the database
    if !is_valid_uuid_token(&parameters.subscription_token) {
        return Err(TokenError::InvalidTokenFormat);
    }

    let email = get_subscriber_email_from_token(&state.db, &parameters.subscription_token)
        .await
        .context("Failed to retrieve subscriber email from token")?;

    let email = email.ok_or(TokenError::InvalidToken)?;

    Ok(axum::Json(UnsubscribeInfo { email }))
}

/// Confirm unsubscribe from newsletter
///
/// Removes a subscriber from the mailing list using their subscription token.
/// This endpoint is called when a user confirms unsubscription on the confirmation page.
#[utoipa::path(
    post,
    path = "/api/subscriptions/unsubscribe",
    tag = "subscriptions",
    params(Parameters),
    responses(
        (status = 200, description = "Successfully unsubscribed"),
        (status = 400, description = "Missing subscription token"),
        (status = 401, description = "Invalid or expired subscription token"),
        (status = 500, description = "Internal server error"),
    )
)]
#[tracing::instrument(name = "Confirm unsubscribe from newsletter", skip(parameters, state))]
pub async fn confirm_unsubscribe(
    State(state): State<AppState>,
    Query(parameters): Query<Parameters>,
) -> Result<impl IntoResponse, TokenError> {
    // Validate token format before querying the database
    if !is_valid_uuid_token(&parameters.subscription_token) {
        return Err(TokenError::InvalidTokenFormat);
    }

    let subscriber_id = get_subscriber_id_from_token(&state.db, &parameters.subscription_token)
        .await
        .context("Failed to retrieve subscriber ID from token")?;

    let subscriber_id = subscriber_id.ok_or(TokenError::InvalidToken)?;

    delete_subscriber(&state.db, subscriber_id)
        .await
        .context("Failed to delete subscriber")?;

    Ok(StatusCode::OK)
}
