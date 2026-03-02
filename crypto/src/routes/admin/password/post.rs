use crate::authentication::{
    AuthError, Credentials, MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, PasswordValidationError,
    UserId, validate_credentials, validate_password_length,
};
use crate::routes::admin::utils::get_username;
use crate::startup::AppState;
use crate::telemetry::error_chain_fmt;
use anyhow::Context;
use axum::extract::{Json, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use secrecy::{ExposeSecret, Secret};

#[derive(serde::Deserialize, utoipa::ToSchema)]
pub struct ChangePasswordFormData {
    /// Current password for verification
    #[schema(value_type = String)]
    current_password: Secret<String>,
    /// New password to set
    #[schema(value_type = String)]
    new_password: Secret<String>,
    /// New password confirmation (must match new_password)
    #[schema(value_type = String)]
    new_password_check: Secret<String>,
}

#[derive(thiserror::Error)]
pub enum ChangePasswordError {
    #[error("You entered two different new passwords - the field values must match.")]
    PasswordMismatch,
    #[error("The new password must have at least {MIN_PASSWORD_LENGTH} characters besides spaces.")]
    PasswordTooShort,
    #[error("The new password must not have more than {MAX_PASSWORD_LENGTH} characters.")]
    PasswordTooLong,
    #[error("The current password is incorrect.")]
    InvalidCurrentPassword,
    #[error(transparent)]
    UnexpectedError(#[from] anyhow::Error),
}

impl std::fmt::Debug for ChangePasswordError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        error_chain_fmt(self, f)
    }
}

#[derive(serde::Serialize, utoipa::ToSchema)]
pub struct ChangePasswordResponse {
    /// Indicates if password change was successful
    success: bool,
    /// Error message if password change failed
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

impl IntoResponse for ChangePasswordError {
    fn into_response(self) -> axum::response::Response {
        let status = match self {
            ChangePasswordError::PasswordMismatch
            | ChangePasswordError::PasswordTooShort
            | ChangePasswordError::PasswordTooLong => StatusCode::BAD_REQUEST,
            ChangePasswordError::InvalidCurrentPassword => StatusCode::UNAUTHORIZED,
            ChangePasswordError::UnexpectedError(_) => StatusCode::INTERNAL_SERVER_ERROR,
        };

        (
            status,
            Json(ChangePasswordResponse {
                success: false,
                error: Some(self.to_string()),
            }),
        )
            .into_response()
    }
}

/// Change admin password
///
/// Changes the password for the currently authenticated admin user.
/// Requires authentication and current password verification.
#[utoipa::path(
    post,
    path = "/api/admin/password",
    tag = "admin",
    request_body = ChangePasswordFormData,
    responses(
        (status = 200, description = "Password changed successfully", body = ChangePasswordResponse),
        (status = 400, description = "Invalid password format or mismatch", body = ChangePasswordResponse),
        (status = 401, description = "Current password incorrect or not authenticated", body = ChangePasswordResponse),
        (status = 500, description = "Internal server error", body = ChangePasswordResponse),
    )
)]
pub async fn change_password(
    user_id: UserId,
    State(state): State<AppState>,
    Json(form): Json<ChangePasswordFormData>,
) -> Result<impl IntoResponse, ChangePasswordError> {
    // Validate password match
    if form.new_password.expose_secret() != form.new_password_check.expose_secret() {
        return Err(ChangePasswordError::PasswordMismatch);
    }

    // Validate password length
    if let Err(validation_error) = validate_password_length(&form.new_password) {
        return Err(match validation_error {
            PasswordValidationError::TooShort => ChangePasswordError::PasswordTooShort,
            PasswordValidationError::TooLong => ChangePasswordError::PasswordTooLong,
        });
    }

    // Get username for credential validation
    let username = get_username(*user_id, &state.db)
        .await
        .context("Failed to retrieve username")?;

    let credentials = Credentials {
        username,
        password: form.current_password,
    };

    // Validate current password
    if let Err(e) = validate_credentials(credentials, &state.db).await {
        match e {
            AuthError::InvalidCredentials(_) => {
                return Err(ChangePasswordError::InvalidCurrentPassword);
            }
            AuthError::UnexpectedError(err) => {
                return Err(ChangePasswordError::UnexpectedError(err));
            }
        }
    }

    // Change password
    crate::authentication::change_password(*user_id, form.new_password, &state.db)
        .await
        .context("Failed to change password")?;

    Ok((
        StatusCode::OK,
        Json(ChangePasswordResponse {
            success: true,
            error: None,
        }),
    ))
}
