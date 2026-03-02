use crate::routes::admin::utils::get_username;
use crate::session_state::TypedSession;
use crate::startup::AppState;
use axum::extract::State;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Json};
use serde::Serialize;
use tower_sessions::Session;

#[derive(Serialize, utoipa::ToSchema)]
pub struct AuthCheckResponse {
    authenticated: bool,
    username: Option<String>,
}

/// Check authentication status
#[utoipa::path(
    get,
    path = "/api/auth/me",
    tag = "authentication",
    responses(
        (status = 200, description = "Authentication status", body = AuthCheckResponse)
    )
)]
pub async fn auth_check_endpoint(
    session: Session,
    State(state): State<AppState>,
) -> impl IntoResponse {
    let typed_session = TypedSession(session);
    match typed_session.get_user_id().await {
        Ok(Some(user_id)) => match get_username(user_id, &state.db).await {
            Ok(username) => (
                StatusCode::OK,
                Json(AuthCheckResponse {
                    authenticated: true,
                    username: Some(username),
                }),
            )
                .into_response(),
            Err(e) => {
                tracing::error!("Failed to get username for auth check: {:?}", e);
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(AuthCheckResponse {
                        authenticated: false,
                        username: None,
                    }),
                )
                    .into_response()
            }
        },
        Ok(None) | Err(_) => (
            StatusCode::UNAUTHORIZED,
            Json(AuthCheckResponse {
                authenticated: false,
                username: None,
            }),
        )
            .into_response(),
    }
}
