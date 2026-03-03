use crate::session_state::TypedSession;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Json};
use serde::Serialize;
use tower_sessions::Session;

#[derive(Serialize, utoipa::ToSchema)]
pub struct LogoutResponse {
    /// Indicates if logout was successful
    success: bool,
    /// Error message if logout failed
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

/// Log out from admin session
///
/// Clears the user's session and logs them out. Requires authentication.
#[utoipa::path(
    post,
    path = "/api/admin/logout",
    tag = "admin",
    responses(
        (status = 200, description = "Successfully logged out", body = LogoutResponse),
        (status = 401, description = "Not logged in", body = LogoutResponse),
    )
)]
pub async fn log_out(session: Session) -> impl IntoResponse {
    let typed_session = TypedSession(session);

    let not_logged_in_response = (
        StatusCode::UNAUTHORIZED,
        Json(LogoutResponse {
            success: false,
            error: Some("Not logged in".to_string()),
        }),
    )
        .into_response();

    match typed_session.get_user_id().await {
        Ok(None) => not_logged_in_response,
        Ok(Some(_)) => {
            // Logout (removes user_id, cycles session ID)
            typed_session.log_out().await;
            (
                StatusCode::OK,
                Json(LogoutResponse {
                    success: true,
                    error: None,
                }),
            )
                .into_response()
        }
        Err(_) => not_logged_in_response,
    }
}
