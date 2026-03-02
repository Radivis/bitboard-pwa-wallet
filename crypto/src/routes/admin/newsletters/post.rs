use crate::startup::AppState;
use anyhow::Context;
use axum::extract::{Json, State};
use axum::http::{HeaderValue, StatusCode, header};
use axum::response::{IntoResponse, Response};

use sqlx::{Executor, Postgres, Transaction};
use uuid::Uuid;

use crate::authentication::UserId;
use crate::domain::SubscriberEmailAddress;
use crate::idempotency::{IdempotencyKey, NextAction, save_response, try_processing};
use crate::telemetry::error_chain_fmt;

#[derive(Debug, serde::Deserialize, utoipa::ToSchema)]
pub struct SendNewsletterFormData {
    /// Newsletter title
    title: String,
    /// HTML content of the newsletter
    html_content: String,
    /// Plain text content of the newsletter
    text_content: String,
    /// Idempotency key to prevent duplicate submissions
    idempotency_key: String,
}

#[allow(dead_code)]
struct ConfirmedSubscriber {
    email: SubscriberEmailAddress,
}

#[derive(serde::Serialize, utoipa::ToSchema)]
pub struct PublishNewsletterResponse {
    /// Indicates if newsletter was published successfully
    success: bool,
    /// Error message if publishing failed
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
    /// Success message
    #[serde(skip_serializing_if = "Option::is_none")]
    message: Option<String>,
}

#[derive(thiserror::Error)]
pub enum PublishError {
    #[error("Authentication failed")]
    AuthError(#[source] anyhow::Error),
    #[error(transparent)]
    UnexpectedError(#[from] anyhow::Error),
}

impl std::fmt::Debug for PublishError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        error_chain_fmt(self, f)
    }
}

#[tracing::instrument(name = "Get confirmed subscribers", skip(db))]
async fn get_confirmed_subscribers(
    db: &sqlx::PgPool,
) -> Result<Vec<Result<ConfirmedSubscriber, anyhow::Error>>, anyhow::Error> {
    let confirmed_subscribers = sqlx::query!(
        r#"
        SELECT email
        FROM subscriptions
        WHERE status = $1
        "#,
        crate::routes::constants::SUBSCRIPTION_STATUS_CONFIRMED,
    )
    .fetch_all(db)
    .await?
    .into_iter()
    .map(|r| match SubscriberEmailAddress::parse(r.email) {
        Ok(email) => Ok(ConfirmedSubscriber { email }),
        Err(error) => Err(anyhow::anyhow!(error)),
    })
    .collect();

    Ok(confirmed_subscribers)
}

#[tracing::instrument(skip_all)]
async fn insert_newsletter_issue(
    transaction: &mut Transaction<'_, Postgres>,
    title: &str,
    text_content: &str,
    html_content: &str,
) -> Result<Uuid, sqlx::Error> {
    let newsletter_issue_id = Uuid::new_v4();
    let query = sqlx::query!(
        r#"
        INSERT INTO newsletter_issues (
        newsletter_issue_id,
        title,
        text_content,
        html_content,
        published_at
        )
        VALUES ($1, $2, $3, $4, now())
        "#,
        newsletter_issue_id,
        title,
        text_content,
        html_content
    );
    transaction.execute(query).await?;
    Ok(newsletter_issue_id)
}

#[tracing::instrument(skip_all)]
async fn enqueue_delivery_tasks(
    transaction: &mut Transaction<'_, Postgres>,
    newsletter_issue_id: Uuid,
) -> Result<(), sqlx::Error> {
    let query = sqlx::query!(
        r#"
        INSERT INTO issue_delivery_queue (
        newsletter_issue_id,
        subscriber_email_address
        )
        SELECT $1, email
        FROM subscriptions
        WHERE status = $2
        "#,
        newsletter_issue_id,
        crate::routes::constants::SUBSCRIPTION_STATUS_CONFIRMED,
    );
    transaction.execute(query).await?;
    Ok(())
}

// Axum version
/// Publish newsletter to confirmed subscribers
///
/// Sends a newsletter to all confirmed subscribers. Requires authentication.
/// Uses idempotency keys to prevent duplicate sends.
#[utoipa::path(
    post,
    path = "/api/admin/newsletters",
    tag = "admin",
    request_body = SendNewsletterFormData,
    responses(
        (status = 200, description = "Newsletter published successfully", body = PublishNewsletterResponse),
        (status = 400, description = "Invalid form data"),
        (status = 401, description = "Not authenticated"),
        (status = 500, description = "Internal server error"),
    )
)]
#[tracing::instrument(
    name = "Publish Newsletter",
    skip(form, state, user_id)
    fields(username=tracing::field::Empty, user_id=tracing::field::Empty)
)]
pub async fn publish_newsletter(
    user_id: UserId,
    State(state): State<AppState>,
    Json(form): Json<SendNewsletterFormData>,
) -> Result<impl IntoResponse, PublishError> {
    let SendNewsletterFormData {
        title,
        text_content,
        html_content,
        idempotency_key,
    } = form;
    let idempotency_key: IdempotencyKey = idempotency_key.try_into().map_err(|e| {
        PublishError::UnexpectedError(anyhow::anyhow!("Invalid idempotency key: {}", e))
    })?;

    let success_response = (
        StatusCode::OK,
        Json(PublishNewsletterResponse {
            success: true,
            error: None,
            message: Some(
                "The newsletter issue has been accepted - emails will go out shortly.".to_string(),
            ),
        }),
    )
        .into_response();

    let mut transaction = match try_processing(&state.db, &idempotency_key, *user_id).await? {
        NextAction::StartProcessing(t) => t,
        NextAction::ReturnSavedResponse(saved_response) => {
            tracing::info!(
                "Returning saved response due to idempotency: {:?}",
                saved_response.status()
            );
            // Always return JSON response - convert old redirect responses to JSON
            // This ensures we maintain a clean JSON API regardless of what was saved before
            if saved_response.status() == StatusCode::SEE_OTHER
                || saved_response.status() == StatusCode::FOUND
                || saved_response.status() == StatusCode::TEMPORARY_REDIRECT
                || saved_response.status() == StatusCode::PERMANENT_REDIRECT
            {
                return Ok(success_response);
            }
            // For non-redirect saved responses, check if it's JSON
            // If not, convert to JSON format
            let (parts, body) = saved_response.into_parts();
            let body_bytes = axum::body::to_bytes(body, usize::MAX).await.map_err(|e| {
                PublishError::UnexpectedError(anyhow::anyhow!(
                    "Failed to read saved response body: {}",
                    e
                ))
            })?;

            // Check if the saved response is JSON by checking Content-Type header
            // This is needed because the backend was changed to be a JSON API server
            // with the addition of React in the frontend
            let is_json = parts
                .headers
                .get(axum::http::header::CONTENT_TYPE)
                .and_then(|h| h.to_str().ok())
                .map(|ct| ct.starts_with("application/json"))
                .unwrap_or(false);

            if is_json {
                // Return the saved JSON response as-is
                return Ok((parts.status, parts.headers, body_bytes).into_response());
            } else {
                // Convert non-JSON saved response to JSON format
                tracing::warn!("Converting non-JSON saved response to JSON format");
                return Ok(success_response);
            }
        }
    };

    tracing::Span::current().record("user_id", tracing::field::display(&user_id));
    let subscribers = get_confirmed_subscribers(&state.db).await?;
    tracing::info!(
        "Publishing new newsletter to {} confirmed subscribers",
        subscribers.len()
    );
    let issue_id = insert_newsletter_issue(&mut transaction, &title, &text_content, &html_content)
        .await
        .context("Failed to store newsletter issue details")?;
    enqueue_delivery_tasks(&mut transaction, issue_id)
        .await
        .context("Failed to enqueue delivery tasks")?;

    let response = save_response(transaction, &idempotency_key, *user_id, success_response).await?;
    Ok(response)
}

impl IntoResponse for PublishError {
    fn into_response(self) -> Response {
        match self {
            PublishError::UnexpectedError(ref err) => (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(PublishNewsletterResponse {
                    success: false,
                    error: Some(format!("Unexpected error: {:#}", err)),
                    message: None,
                }),
            )
                .into_response(),
            PublishError::AuthError(_) => {
                let mut headers = axum::http::HeaderMap::new();
                let header_value = HeaderValue::from_static(r#"Basic realm="publish""#);
                headers.insert(header::WWW_AUTHENTICATE, header_value);
                (
                    StatusCode::UNAUTHORIZED,
                    headers,
                    Json(PublishNewsletterResponse {
                        success: false,
                        error: Some("Authentication failed".to_string()),
                        message: None,
                    }),
                )
                    .into_response()
            }
        }
    }
}
