use axum::extract::FromRequestParts;
use axum::http::request::Parts;
use tower_sessions::Session;
use uuid::Uuid;

pub struct TypedSession(pub Session);

impl TypedSession {
    const USER_ID_KEY: &'static str = "user_id";

    pub async fn renew(&self) {
        let _ = self.0.cycle_id().await;
    }

    pub async fn insert_user_id(
        &self,
        user_id: Uuid,
    ) -> Result<(), tower_sessions::session::Error> {
        self.0.insert(Self::USER_ID_KEY, user_id).await
    }

    pub async fn get_user_id(&self) -> Result<Option<Uuid>, tower_sessions::session::Error> {
        self.0.get(Self::USER_ID_KEY).await
    }

    pub async fn log_out(&self) {
        // Remove the user_id from the session (but keep the session itself alive for flash messages)
        let _: Result<Option<Uuid>, _> = self.0.remove(Self::USER_ID_KEY).await;
        // Cycle the session ID for security
        let _ = self.0.cycle_id().await;
    }
}

impl<S> FromRequestParts<S> for TypedSession
where
    S: Send + Sync,
{
    type Rejection = axum::http::StatusCode;

    async fn from_request_parts(parts: &mut Parts, _state: &S) -> Result<Self, Self::Rejection> {
        let session = parts
            .extensions
            .get::<tower_sessions::Session>()
            .ok_or(axum::http::StatusCode::INTERNAL_SERVER_ERROR)?
            .clone();
        Ok(TypedSession(session))
    }
}
