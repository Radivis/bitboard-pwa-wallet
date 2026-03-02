use crate::authentication::UserId;
use crate::domain::{NewBlogPost, UpdateBlogPost};
pub use crate::routes::blog::BlogPostResponse;
use crate::routes::blog::queries;
use crate::startup::AppState;
use axum::Extension;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Json};
use serde::Serialize;
use sqlx::Error as SqlxError;
use uuid::Uuid;

fn db_error_to_status(e: SqlxError, context: &str) -> StatusCode {
    match &e {
        SqlxError::RowNotFound => {
            tracing::error!("{} not found", context);
            StatusCode::NOT_FOUND
        }
        _ => {
            tracing::error!("{}: {:?}", context, e);
            StatusCode::INTERNAL_SERVER_ERROR
        }
    }
}

#[derive(Serialize, utoipa::ToSchema)]
pub struct MessageResponse {
    /// Response message
    pub message: String,
}

#[derive(Serialize, utoipa::ToSchema)]
pub struct DeletePostResponse {
    /// Whether the post was actually deleted
    pub is_actual_deletion: bool,
    /// Title of the deleted post
    pub title: String,
}

/// Admin: Get all blog posts
///
/// Returns all blog posts regardless of status. Requires authentication.
#[utoipa::path(
    get,
    path = "/api/admin/blog/posts",
    tag = "admin-blog",
    responses(
        (status = 200, description = "List of all blog posts", body = Vec<BlogPostResponse>),
        (status = 401, description = "Not authenticated"),
        (status = 500, description = "Internal server error"),
    )
)]
#[tracing::instrument(name = "Admin: Get all blog posts", skip(state))]
pub async fn admin_get_all_posts(
    State(state): State<AppState>,
    Extension(_user_id): Extension<UserId>,
) -> Result<Json<Vec<BlogPostResponse>>, StatusCode> {
    let posts = queries::get_all_posts(&state.db)
        .await
        .map_err(|e| db_error_to_status(e, "All posts"))?;

    let response: Vec<BlogPostResponse> = posts.into_iter().map(Into::into).collect();
    Ok(Json(response))
}

/// Admin: Get single blog post by ID
///
/// Returns a specific blog post regardless of status. Requires authentication.
#[utoipa::path(
    get,
    path = "/api/admin/blog/posts/{id}",
    tag = "admin-blog",
    params(
        ("id" = Uuid, Path, description = "Blog post unique identifier")
    ),
    responses(
        (status = 200, description = "Blog post found", body = BlogPostResponse),
        (status = 401, description = "Not authenticated"),
        (status = 404, description = "Blog post not found"),
        (status = 500, description = "Internal server error"),
    )
)]
#[tracing::instrument(name = "Admin: Get blog post by id", skip(state))]
pub async fn admin_get_post_by_id(
    State(state): State<AppState>,
    Path(post_id): Path<Uuid>,
    Extension(_user_id): Extension<UserId>,
) -> Result<Json<BlogPostResponse>, StatusCode> {
    let post = queries::get_post_by_id(&state.db, post_id, None)
        .await
        .map_err(|e| db_error_to_status(e, &format!("Post {}", post_id)))?;

    Ok(Json(post.into()))
}

/// Admin: Create new blog post
///
/// Creates a new blog post with the given title, content, and status.
/// Requires authentication.
#[utoipa::path(
    post,
    path = "/api/admin/blog/posts",
    tag = "admin-blog",
    request_body = NewBlogPost,
    responses(
        (status = 201, description = "Blog post created", body = BlogPostResponse),
        (status = 401, description = "Not authenticated"),
        (status = 500, description = "Internal server error"),
    )
)]
#[tracing::instrument(name = "Admin: Create blog post", skip(state, new_post))]
pub async fn admin_create_post(
    State(state): State<AppState>,
    Extension(user_id): Extension<UserId>,
    Json(new_post): Json<NewBlogPost>,
) -> Result<impl IntoResponse, StatusCode> {
    let post = queries::insert_post(
        &state.db,
        &new_post.title,
        &new_post.content,
        &new_post.status,
        *user_id,
    )
    .await
    .map_err(|e| db_error_to_status(e, "Create post"))?;

    Ok((StatusCode::CREATED, Json(BlogPostResponse::from(post))))
}

/// Admin: Update existing blog post
///
/// Updates an existing blog post's title, content, and/or status.
/// Requires authentication.
#[utoipa::path(
    put,
    path = "/api/admin/blog/posts/{id}",
    tag = "admin-blog",
    params(
        ("id" = Uuid, Path, description = "Blog post unique identifier")
    ),
    request_body = UpdateBlogPost,
    responses(
        (status = 200, description = "Blog post updated", body = BlogPostResponse),
        (status = 401, description = "Not authenticated"),
        (status = 404, description = "Blog post not found"),
        (status = 500, description = "Internal server error"),
    )
)]
#[tracing::instrument(name = "Admin: Update blog post", skip(state, update_post))]
pub async fn admin_update_post(
    State(state): State<AppState>,
    Path(post_id): Path<Uuid>,
    Extension(_user_id): Extension<UserId>,
    Json(update_post): Json<UpdateBlogPost>,
) -> Result<Json<BlogPostResponse>, StatusCode> {
    let post = queries::update_post(
        &state.db,
        post_id,
        &update_post.title,
        &update_post.content,
        &update_post.status,
    )
    .await
    .map_err(|e| db_error_to_status(e, &format!("Post {}", post_id)))?;

    Ok(Json(post.into()))
}

/// Admin: Delete blog post
///
/// Permanently deletes a blog post. Requires authentication.
#[utoipa::path(
    delete,
    path = "/api/admin/blog/posts/{id}",
    tag = "admin-blog",
    params(
        ("id" = Uuid, Path, description = "Blog post unique identifier")
    ),
    responses(
        (status = 200, description = "Blog post deleted", body = DeletePostResponse),
        (status = 401, description = "Not authenticated"),
        (status = 500, description = "Internal server error"),
    )
)]
#[tracing::instrument(name = "Admin: Delete blog post", skip(state))]
pub async fn admin_delete_post(
    State(state): State<AppState>,
    Path(post_id): Path<Uuid>,
    Extension(_user_id): Extension<UserId>,
) -> Result<Json<DeletePostResponse>, StatusCode> {
    let result = queries::delete_post(&state.db, post_id)
        .await
        .map_err(|e| db_error_to_status(e, &format!("Post {}", post_id)))?;

    Ok(Json(DeletePostResponse {
        is_actual_deletion: result.is_actual_deletion,
        title: result.title,
    }))
}
