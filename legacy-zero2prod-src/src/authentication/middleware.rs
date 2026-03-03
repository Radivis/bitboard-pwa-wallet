use axum::extract::FromRequestParts;
use axum::http::request::Parts;
use axum::response::Redirect;
use std::ops::Deref;
use uuid::Uuid;

use crate::session_state::TypedSession;

#[derive(Copy, Clone, Debug)]
pub struct UserId(Uuid);

impl std::fmt::Display for UserId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        self.0.fmt(f)
    }
}

impl Deref for UserId {
    type Target = Uuid;
    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl<S> FromRequestParts<S> for UserId
where
    S: Send + Sync,
{
    type Rejection = Redirect;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        let session = tower_sessions::Session::from_request_parts(parts, state)
            .await
            .map_err(|_| Redirect::to("/login"))?;

        let typed_session = TypedSession(session);
        match typed_session.get_user_id().await {
            Ok(Some(user_id)) => Ok(UserId(user_id)),
            Ok(None) | Err(_) => Err(Redirect::to("/login")),
        }
    }
}
