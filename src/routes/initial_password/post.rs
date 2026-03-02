use crate::authentication::{
    MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, PasswordValidationError, validate_password_length,
};
use crate::startup::AppState;
use crate::telemetry::error_chain_fmt;
use anyhow::Context;
use axum::extract::{Json, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use secrecy::{ExposeSecret, Secret};

#[derive(serde::Deserialize, utoipa::ToSchema)]
pub struct InitialPasswordFormData {
    username: String,
    #[schema(value_type = String)]
    password: Secret<String>,
    #[schema(value_type = String)]
    password_confirmation: Secret<String>,
}

#[derive(serde::Serialize)]
pub struct InitialPasswordResponse {
    success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    username: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    message: Option<String>,
}

#[derive(thiserror::Error)]
pub enum InitialPasswordError {
    #[error("You entered two different passwords - the field values must match.")]
    PasswordMismatch,
    #[error("The password must have at least {MIN_PASSWORD_LENGTH} characters besides spaces.")]
    PasswordTooShort,
    #[error("The password must not have more than {MAX_PASSWORD_LENGTH} characters.")]
    PasswordTooLong,
    #[error("Users already exist. Initial password setup is only available when no users exist.")]
    UsersAlreadyExist,
    #[error(transparent)]
    UnexpectedError(#[from] anyhow::Error),
}

impl std::fmt::Debug for InitialPasswordError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        error_chain_fmt(self, f)
    }
}

impl IntoResponse for InitialPasswordError {
    fn into_response(self) -> axum::response::Response {
        let status = match self {
            InitialPasswordError::PasswordMismatch
            | InitialPasswordError::PasswordTooShort
            | InitialPasswordError::PasswordTooLong
            | InitialPasswordError::UsersAlreadyExist => StatusCode::BAD_REQUEST,
            InitialPasswordError::UnexpectedError(_) => StatusCode::INTERNAL_SERVER_ERROR,
        };

        (
            status,
            Json(InitialPasswordResponse {
                success: false,
                error: Some(self.to_string()),
                username: None,
                message: None,
            }),
        )
            .into_response()
    }
}

/// Create initial admin password
///
/// Creates the first admin user when no users exist
#[utoipa::path(
    post,
    path = "/api/initial_password",
    tag = "authentication",
    request_body = InitialPasswordFormData,
    responses(
        (status = 201, description = "Admin user created successfully"),
        (status = 400, description = "Validation error or users already exist")
    )
)]
#[tracing::instrument(skip(form, state))]
pub async fn create_initial_password(
    State(state): State<AppState>,
    Json(form): Json<InitialPasswordFormData>,
) -> Result<impl IntoResponse, InitialPasswordError> {
    // First check if users already exist - this is a security check
    let users_exist = crate::authentication::check_users_exist(&state.db)
        .await
        .context("Failed to check if users exist")?;

    if users_exist {
        return Err(InitialPasswordError::UsersAlreadyExist);
    }

    // Validate password match
    if form.password.expose_secret() != form.password_confirmation.expose_secret() {
        return Err(InitialPasswordError::PasswordMismatch);
    }

    // Validate password length
    if let Err(validation_error) = validate_password_length(&form.password) {
        return Err(match validation_error {
            PasswordValidationError::TooShort => InitialPasswordError::PasswordTooShort,
            PasswordValidationError::TooLong => InitialPasswordError::PasswordTooLong,
        });
    }

    // Create admin user with provided username
    let _user_id =
        crate::authentication::create_admin_user(form.username.clone(), form.password, &state.db)
            .await
            .context("Failed to create admin user")?;

    // Return JSON response for API clients
    Ok((
        StatusCode::CREATED,
        Json(InitialPasswordResponse {
            success: true,
            error: None,
            username: Some(form.username.to_string()),
            message: Some("Admin user created successfully. Please log in.".to_string()),
        }),
    ))
}
