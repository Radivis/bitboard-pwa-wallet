use axum::extract::FromRequestParts;
use axum::http::StatusCode;
use axum::http::request::Parts;
use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
use tower_sessions::Session;

const FLASH_MESSAGES_KEY: &str = "_flash_messages";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FlashMessage {
    pub level: String,
    pub content: String,
}

pub struct FlashMessages(VecDeque<FlashMessage>);

impl FlashMessages {
    pub fn iter(&self) -> impl Iterator<Item = &FlashMessage> {
        self.0.iter()
    }

    pub fn is_empty(&self) -> bool {
        self.0.is_empty()
    }
}

pub struct IncomingFlashMessages(pub FlashMessages);

impl<S> FromRequestParts<S> for IncomingFlashMessages
where
    S: Send + Sync,
{
    type Rejection = StatusCode;

    async fn from_request_parts(parts: &mut Parts, _state: &S) -> Result<Self, Self::Rejection> {
        let session = parts
            .extensions
            .get::<Session>()
            .ok_or(StatusCode::INTERNAL_SERVER_ERROR)?
            .clone();

        let messages: VecDeque<FlashMessage> = match session.get(FLASH_MESSAGES_KEY).await {
            Ok(Some(msgs)) => msgs,
            Ok(None) => VecDeque::new(),
            Err(_) => VecDeque::new(),
        };

        // Clear flash messages after reading
        let _: Result<Option<VecDeque<FlashMessage>>, _> = session.remove(FLASH_MESSAGES_KEY).await;

        Ok(IncomingFlashMessages(FlashMessages(messages)))
    }
}

pub struct FlashMessageSender {
    session: Session,
}

impl FlashMessageSender {
    pub fn new(session: Session) -> Self {
        Self { session }
    }

    pub async fn send(&self, message: FlashMessage) -> Result<(), tower_sessions::session::Error> {
        let mut messages: VecDeque<FlashMessage> = match self.session.get(FLASH_MESSAGES_KEY).await
        {
            Ok(Some(msgs)) => msgs,
            Ok(None) => VecDeque::new(),
            Err(e) => return Err(e),
        };
        messages.push_back(message);
        self.session.insert(FLASH_MESSAGES_KEY, messages).await?;
        Ok(())
    }

    pub async fn error(
        &self,
        content: impl Into<String>,
    ) -> Result<(), tower_sessions::session::Error> {
        self.send(FlashMessage {
            level: "error".to_string(),
            content: content.into(),
        })
        .await
    }

    pub async fn info(
        &self,
        content: impl Into<String>,
    ) -> Result<(), tower_sessions::session::Error> {
        self.send(FlashMessage {
            level: "info".to_string(),
            content: content.into(),
        })
        .await
    }
}
