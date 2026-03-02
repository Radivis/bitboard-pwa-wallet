use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::Type, utoipa::ToSchema)]
#[sqlx(type_name = "text", rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
pub enum BlogPostStatus {
    #[serde(rename = "draft")]
    Draft,
    #[serde(rename = "published")]
    Published,
}

impl BlogPostStatus {
    pub fn as_str(&self) -> &str {
        match self {
            BlogPostStatus::Draft => "draft",
            BlogPostStatus::Published => "published",
        }
    }
}

impl std::fmt::Display for BlogPostStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BlogPost {
    pub id: Uuid,
    pub title: String,
    pub content: String,
    pub status: BlogPostStatus,
    pub author_id: Uuid,
    pub author_username: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Deserialize, utoipa::ToSchema)]
pub struct NewBlogPost {
    /// Blog post title
    pub title: String,
    /// Blog post content (markdown or HTML)
    pub content: String,
    /// Post status (draft or published)
    pub status: BlogPostStatus,
}

#[derive(Debug, Clone, Deserialize, utoipa::ToSchema)]
pub struct UpdateBlogPost {
    /// Blog post title
    pub title: String,
    /// Blog post content (markdown or HTML)
    pub content: String,
    /// Post status (draft or published)
    pub status: BlogPostStatus,
}
