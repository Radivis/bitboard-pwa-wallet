use axum::http::StatusCode;

/// Health check endpoint
///
/// Returns 200 OK if the service is running
#[utoipa::path(
    get,
    path = "/health_check",
    tag = "health",
    responses(
        (status = 200, description = "Service is healthy")
    )
)]
pub async fn health_check() -> StatusCode {
    StatusCode::OK
}
