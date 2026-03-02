pub mod queries;

use crate::domain::{BlogPost, BlogPostStatus};
use crate::startup::AppState;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::Json;
use serde::Serialize;
use uuid::Uuid;

#[derive(Serialize, utoipa::ToSchema)]
pub struct BlogPostResponse {
    /// Unique identifier for the blog post
    pub id: Uuid,
    /// Post title
    pub title: String,
    /// Post content (markdown or HTML)
    pub content: String,
    /// Post status (draft or published)
    pub status: String,
    /// Author's username
    pub author_username: String,
    /// Creation timestamp (RFC3339 format)
    pub created_at: String,
    /// Last update timestamp (RFC3339 format)
    pub updated_at: String,
}

impl From<BlogPost> for BlogPostResponse {
    fn from(post: BlogPost) -> Self {
        BlogPostResponse {
            id: post.id,
            title: post.title,
            content: post.content,
            status: post.status.as_str().to_string(),
            author_username: post
                .author_username
                .unwrap_or_else(|| "Unknown".to_string()),
            created_at: post.created_at.to_rfc3339(),
            updated_at: post.updated_at.to_rfc3339(),
        }
    }
}

/// Get all published blog posts
///
/// Returns a list of all blog posts with "published" status.
/// No authentication required.
#[utoipa::path(
    get,
    path = "/api/blog/posts",
    tag = "blog",
    responses(
        (status = 200, description = "List of published blog posts", body = Vec<BlogPostResponse>),
        (status = 500, description = "Internal server error"),
    )
)]
#[tracing::instrument(name = "Get published blog posts", skip(state))]
pub async fn get_published_posts(
    State(state): State<AppState>,
) -> Result<Json<Vec<BlogPostResponse>>, StatusCode> {
    let posts = queries::get_published_posts(&state.db).await.map_err(|e| {
        tracing::error!("Failed to fetch published posts: {:?}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let response: Vec<BlogPostResponse> = posts.into_iter().map(Into::into).collect();
    Ok(Json(response))
}

/// Get a single published blog post by ID
///
/// Returns a specific blog post if it exists and has "published" status.
/// No authentication required.
#[utoipa::path(
    get,
    path = "/api/blog/posts/{id}",
    tag = "blog",
    params(
        ("id" = Uuid, Path, description = "Blog post unique identifier")
    ),
    responses(
        (status = 200, description = "Blog post found", body = BlogPostResponse),
        (status = 404, description = "Blog post not found or not published"),
        (status = 500, description = "Internal server error"),
    )
)]
#[tracing::instrument(name = "Get blog post by id", skip(state))]
pub async fn get_post_by_id(
    State(state): State<AppState>,
    Path(post_id): Path<Uuid>,
) -> Result<Json<BlogPostResponse>, StatusCode> {
    let post = queries::get_post_by_id(&state.db, post_id, Some(BlogPostStatus::Published))
        .await
        .map_err(|e| {
            tracing::error!("Failed to fetch post {}: {:?}", post_id, e);
            StatusCode::NOT_FOUND
        })?;

    Ok(Json(post.into()))
}
