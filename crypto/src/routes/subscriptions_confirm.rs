use crate::routes::constants::{
    SUBSCRIPTION_CONFIRMED_REDIRECT_PATH, SUBSCRIPTION_STATUS_CONFIRMED,
};
use crate::routes::subscription_tokens::{
    SubscriptionTokenParameters, TokenError, get_subscriber_id_from_token,
};
use crate::routes::utils::is_valid_uuid_token;
use crate::startup::AppState;
use anyhow::Context;
use axum::extract::{Query, State};
use axum::response::{IntoResponse, Redirect};
use uuid::Uuid;

#[tracing::instrument(name = "Mark subscriber as confirmed", skip(subscriber_id, db))]
pub async fn confirm_subscriber(db: &sqlx::PgPool, subscriber_id: Uuid) -> Result<(), sqlx::Error> {
    sqlx::query!(
        r#"UPDATE subscriptions SET status = $1 WHERE id = $2"#,
        SUBSCRIPTION_STATUS_CONFIRMED,
        subscriber_id,
    )
    .execute(db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to execute query: {:?}", e);
        e
    })?;
    Ok(())
}

/// Subscription confirmation token parameters (re-export for OpenAPI)
pub type Parameters = SubscriptionTokenParameters;

/// Confirm newsletter subscription
///
/// Activates a subscription using the token received via email.
/// This endpoint is called when a user clicks the confirmation link in their email.
/// Redirects to the frontend's subscribed page on success.
#[utoipa::path(
    get,
    path = "/api/subscriptions/confirm",
    tag = "subscriptions",
    params(Parameters),
    responses(
        (status = 303, description = "Subscription confirmed successfully, redirecting to /subscribed"),
        (status = 401, description = "Invalid or expired subscription token"),
        (status = 500, description = "Internal server error"),
    )
)]
#[tracing::instrument(name = "Confirm a pending subscriber", skip(parameters, state))]
pub async fn confirm(
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

    confirm_subscriber(&state.db, subscriber_id)
        .await
        .context("Failed to confirm subscriber")?;

    Ok(Redirect::to(SUBSCRIPTION_CONFIRMED_REDIRECT_PATH))
}
