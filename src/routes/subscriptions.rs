use crate::domain::{NewSubscriber, SubscriberEmailAddress, SubscriberName};
use crate::email_client::{EmailClient, EmailData};
use crate::routes::constants::{
    SUBSCRIPTION_STATUS_PENDING_CONFIRMATION, subscription_confirm_url,
};
use crate::startup::AppState;
use crate::telemetry::error_chain_fmt;
use anyhow::Context;
use axum::extract::{Json, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use chrono::Utc;
use sqlx::{Executor, Postgres, Transaction};
use uuid::Uuid;

#[derive(serde::Deserialize, utoipa::ToSchema)]
#[allow(dead_code)]
pub struct FormData {
    /// Subscriber's email address
    email: String,
    /// Subscriber's name
    name: String,
}

impl TryFrom<FormData> for NewSubscriber {
    type Error = String;

    fn try_from(value: FormData) -> Result<Self, Self::Error> {
        let name = SubscriberName::parse(value.name)?;
        let email = SubscriberEmailAddress::parse(value.email)?;
        Ok(Self { email, name })
    }
}

pub struct StoreTokenError(pub sqlx::Error);

impl std::fmt::Debug for StoreTokenError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        error_chain_fmt(self, f)
    }
}

impl From<sqlx::Error> for StoreTokenError {
    fn from(err: sqlx::Error) -> Self {
        StoreTokenError(err)
    }
}

impl std::fmt::Display for StoreTokenError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "A database error was encountered while \
            trying to store a subscription token."
        )
    }
}

impl std::error::Error for StoreTokenError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        // The compiler transparently casts `&sqlx::Error` into a `&dyn Error`
        Some(&self.0)
    }
}

#[derive(thiserror::Error)]
pub enum SubscribeError {
    #[error("{0}")]
    ValidationError(String),
    #[error(transparent)]
    UnexpectedError(#[from] anyhow::Error),
}

impl std::fmt::Debug for SubscribeError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        error_chain_fmt(self, f)
    }
}
impl From<String> for SubscribeError {
    fn from(e: String) -> Self {
        Self::ValidationError(e)
    }
}

impl axum::response::IntoResponse for SubscribeError {
    fn into_response(self) -> axum::response::Response {
        let status = match self {
            SubscribeError::ValidationError(_) => StatusCode::BAD_REQUEST,
            SubscribeError::UnexpectedError(_) => StatusCode::INTERNAL_SERVER_ERROR,
        };
        (status, self.to_string()).into_response()
    }
}

pub fn parse_subscriber(form: FormData) -> Result<NewSubscriber, String> {
    let name = SubscriberName::parse(form.name)?;
    let email = SubscriberEmailAddress::parse(form.email)?;
    Ok(NewSubscriber { email, name })
}

/// Subscribe to the newsletter
///
/// Creates a new subscription request and sends a confirmation email.
/// The subscription is not active until the user clicks the confirmation link in the email.
#[utoipa::path(
    post,
    path = "/api/subscriptions",
    tag = "subscriptions",
    request_body = FormData,
    responses(
        (status = 200, description = "Subscription request received, confirmation email sent"),
        (status = 400, description = "Invalid form data (invalid email or name format)"),
        (status = 500, description = "Internal server error"),
    )
)]
#[tracing::instrument(
    name = "Adding a new subscriber",
    skip(form, state),
    fields(
        subscriber_email = %form.email,
        subscriber_name = %form.name
    )
)]
pub async fn subscribe(
    State(state): State<AppState>,
    Json(form): Json<FormData>,
) -> Result<impl IntoResponse, SubscribeError> {
    let subscriber = form.try_into().map_err(SubscribeError::ValidationError)?;
    let mut transaction = state
        .db
        .begin()
        .await
        .context("Failed to acquire a Postgres connection from the pool")?;

    let subscription_token = match get_subscriber_id_by_email(&mut transaction, &subscriber)
        .await
        .context("Failed to look up existing subscriber.")?
    {
        Some(existing_subscriber_id) => fetch_token(&mut transaction, existing_subscriber_id)
            .await
            .context("Failed to fetch subscription token for existing subscriber.")?
            .expect("Existing subscriber must have a token"),
        None => {
            let subscriber_id = insert_subscriber(&mut transaction, &subscriber)
                .await
                .context("Failed to insert new subscriber in the database.")?;
            let new_token = Uuid::new_v4().simple().to_string();
            store_token(&mut transaction, subscriber_id, &new_token)
                .await
                .context("Failed to store the confirmation token for a new subscriber.")?;
            new_token
        }
    };

    transaction
        .commit()
        .await
        .context("Failed to commit SQL transaction to store a new subscriber.")?;

    send_confirmation_email(
        &state.email_client,
        subscriber,
        &state.base_url.0,
        &subscription_token,
    )
    .await
    .context("Failed to send a confirmation email.")?;
    Ok(StatusCode::OK)
}

#[tracing::instrument(
    name = "Saving new subscriber details in the database",
    skip(new_subscriber, transaction)
)]
pub async fn insert_subscriber(
    transaction: &mut Transaction<'_, Postgres>,
    new_subscriber: &NewSubscriber,
) -> Result<Uuid, sqlx::Error> {
    let subscriber_id = Uuid::new_v4();
    let query = sqlx::query!(
        r#"
        INSERT INTO subscriptions (id, email, name, subscribed_at, status)
        VALUES ($1, $2, $3, $4, $5)
        "#,
        subscriber_id,
        new_subscriber.email.as_ref(),
        new_subscriber.name.as_ref(),
        Utc::now(),
        SUBSCRIPTION_STATUS_PENDING_CONFIRMATION
    );

    transaction.execute(query).await?;
    Ok(subscriber_id)
}

#[tracing::instrument(
    name = "Send a confirmation email to a new subscriber",
    skip(email_client, new_subscriber, base_url)
)]
pub async fn send_confirmation_email(
    email_client: &EmailClient,
    new_subscriber: NewSubscriber,
    base_url: &str,
    subscription_token: &str,
) -> Result<(), reqwest::Error> {
    let confirmation_link = subscription_confirm_url(base_url, subscription_token);
    tracing::debug!(
        "Trying to send email to subscriber via email_client: {:?}",
        &email_client
    );
    let text_content = &format!(
        "Welcome to the newsletter!

Thank you for subscribing. Please confirm your email address by visiting the link below:

{}

If you didn't sign up for this newsletter, you can safely ignore this email.

Best regards,
The radivis.com Team",
        confirmation_link
    );
    let html_content = &format!(
        "<!DOCTYPE html>
<html>
<head>
    <meta charset=\"utf-8\">
    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">
</head>
<body style=\"font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;\">
    <h2 style=\"color: #2c3e50;\">Welcome to the newsletter!</h2>
    <p>Thank you for subscribing. Please confirm your email address by clicking the button below:</p>
    <p style=\"text-align: center; margin: 30px 0;\">
        <a href=\"{}\" style=\"display: inline-block; padding: 12px 30px; background-color: #3498db; color: #ffffff; text-decoration: none; border-radius: 5px; font-weight: bold;\">Confirm Email Address</a>
    </p>
    <p style=\"color: #7f8c8d; font-size: 14px;\">Or copy and paste this link into your browser:</p>
    <p style=\"word-break: break-all; color: #3498db; font-size: 12px;\">{}</p>
    <hr style=\"border: none; border-top: 1px solid #ecf0f1; margin: 30px 0;\">
    <p style=\"color: #95a5a6; font-size: 12px;\">If you didn't sign up for this newsletter, you can safely ignore this email.</p>
</body>
</html>",
        confirmation_link, confirmation_link
    );
    email_client
        .send_email(EmailData {
            recipient: &new_subscriber.email,
            subject: &"Please confirm your newsletter subscription".into(),
            text_content,
            html_content,
        })
        .await
}

#[tracing::instrument(
    name = "Get id of subscriber by email, if it exists",
    skip(transaction)
)]
pub async fn get_subscriber_id_by_email(
    transaction: &mut Transaction<'_, Postgres>,
    subscriber: &NewSubscriber,
) -> Result<Option<Uuid>, sqlx::Error> {
    let email = subscriber.email.as_ref();
    let result = sqlx::query!(r#"SELECT id FROM subscriptions WHERE email = $1"#, email)
        .fetch_optional(transaction.as_mut())
        .await?;

    Ok(result.map(|row| row.id))
}

#[tracing::instrument(name = "Fetch subscription token for subscriber", skip(transaction))]
pub async fn fetch_token(
    transaction: &mut Transaction<'_, Postgres>,
    subscriber_id: Uuid,
) -> Result<Option<String>, sqlx::Error> {
    let result = sqlx::query!(
        r#"SELECT subscription_token FROM subscription_tokens WHERE subscriber_id = $1"#,
        subscriber_id
    )
    .fetch_optional(transaction.as_mut())
    .await?;

    Ok(result.map(|row| row.subscription_token))
}

#[tracing::instrument(
    name = "Store subscription token in the database",
    skip(subscription_token, transaction)
)]
pub async fn store_token(
    transaction: &mut Transaction<'_, Postgres>,
    subscriber_id: Uuid,
    subscription_token: &str,
) -> Result<(), StoreTokenError> {
    let query = sqlx::query!(
        r#"INSERT INTO subscription_tokens (subscription_token, subscriber_id)
        VALUES ($1, $2)"#,
        subscription_token,
        subscriber_id
    );

    transaction.execute(query).await?;
    Ok(())
}
