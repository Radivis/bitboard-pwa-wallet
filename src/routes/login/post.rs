use crate::routes::constants::{ERROR_AUTHENTICATION_FAILED, ERROR_SOMETHING_WENT_WRONG};
use crate::session_state::TypedSession;
use crate::startup::AppState;
use axum::extract::{Json, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use secrecy::Secret;
use tower_sessions::Session;

use crate::authentication::{AuthError, Credentials, validate_credentials};

#[derive(serde::Deserialize, utoipa::ToSchema)]
pub struct FormData {
    username: String,
    #[schema(value_type = String)]
    password: Secret<String>,
}

#[derive(serde::Serialize, utoipa::ToSchema)]
pub struct LoginResponse {
    success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

/// User login endpoint
///
/// Authenticates a user and creates a session
#[utoipa::path(
    post,
    path = "/api/login",
    tag = "authentication",
    request_body = FormData,
    responses(
        (status = 200, description = "Login successful", body = LoginResponse),
        (status = 401, description = "Invalid credentials", body = LoginResponse),
        (status = 500, description = "Internal server error", body = LoginResponse)
    )
)]
#[tracing::instrument(
    skip(form, state, session),
    fields(username=tracing::field::Empty, user_id=tracing::field::Empty)
)]
pub async fn login(
    session: Session,
    State(state): State<AppState>,
    Json(form): Json<FormData>,
) -> impl axum::response::IntoResponse {
    let credentials = Credentials {
        username: form.username,
        password: form.password,
    };
    tracing::Span::current().record("username", tracing::field::display(&credentials.username));

    match validate_credentials(credentials, &state.db).await {
        Ok(user_id) => {
            tracing::Span::current().record("user_id", tracing::field::display(&user_id));
            // Use the session directly (don't clone) to ensure changes persist
            let typed_session = TypedSession(session);
            // Insert user_id first, then renew the session
            if let Err(e) = typed_session.insert_user_id(user_id).await {
                tracing::error!("Failed to insert user_id into session: {:?}", e);
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(LoginResponse {
                        success: false,
                        error: Some("Failed to insert user_id into session".to_string()),
                    }),
                )
                    .into_response();
            }
            // Renew the session after inserting user_id to extend its lifetime
            typed_session.renew().await;
            (
                StatusCode::OK,
                Json(LoginResponse {
                    success: true,
                    error: None,
                }),
            )
                .into_response()
        }
        Err(e) => {
            let error_msg = match e {
                AuthError::InvalidCredentials(_) => ERROR_AUTHENTICATION_FAILED,
                AuthError::UnexpectedError(_) => ERROR_SOMETHING_WENT_WRONG,
            };
            (
                StatusCode::UNAUTHORIZED,
                Json(LoginResponse {
                    success: false,
                    error: Some(error_msg.to_string()),
                }),
            )
                .into_response()
        }
    }
}
