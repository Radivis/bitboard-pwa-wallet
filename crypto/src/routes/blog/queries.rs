use crate::domain::{BlogPost, BlogPostStatus};
use sqlx::{PgPool, Row};
use uuid::Uuid;

fn status_from_str(s: &str) -> BlogPostStatus {
    if s == "published" {
        BlogPostStatus::Published
    } else {
        BlogPostStatus::Draft
    }
}

#[tracing::instrument(name = "Fetch published blog posts from database", skip(pool))]
pub async fn get_published_posts(pool: &PgPool) -> Result<Vec<BlogPost>, sqlx::Error> {
    let posts = sqlx::query!(
        r#"
        SELECT 
            bp.id,
            bp.title,
            bp.content,
            bp.status,
            bp.author_id,
            u.username as author_username,
            bp.created_at,
            bp.updated_at
        FROM blog_posts bp
        INNER JOIN users u ON bp.author_id = u.user_id
        WHERE bp.status = 'published'
        ORDER BY bp.created_at DESC
        "#
    )
    .fetch_all(pool)
    .await?
    .into_iter()
    .map(|row| BlogPost {
        id: row.id,
        title: row.title,
        content: row.content,
        status: status_from_str(&row.status),
        author_id: row.author_id,
        author_username: Some(row.author_username),
        created_at: row.created_at,
        updated_at: row.updated_at,
    })
    .collect();

    Ok(posts)
}

#[tracing::instrument(name = "Fetch blog post by id from database", skip(pool))]
pub async fn get_post_by_id(
    pool: &PgPool,
    post_id: Uuid,
    status_filter: Option<BlogPostStatus>,
) -> Result<BlogPost, sqlx::Error> {
    let status_condition = match status_filter {
        Some(status) => format!("AND bp.status = '{}'", status.as_str()),
        None => String::new(),
    };

    let query_str = format!(
        r#"
        SELECT 
            bp.id,
            bp.title,
            bp.content,
            bp.status,
            bp.author_id,
            u.username as author_username,
            bp.created_at,
            bp.updated_at
        FROM blog_posts bp
        INNER JOIN users u ON bp.author_id = u.user_id
        WHERE bp.id = $1
        {}
        "#,
        status_condition
    );

    let row = sqlx::query(&query_str)
        .bind(post_id)
        .fetch_one(pool)
        .await?;

    let status_str: String = row.try_get("status")?;
    Ok(BlogPost {
        id: row.try_get("id")?,
        title: row.try_get("title")?,
        content: row.try_get("content")?,
        status: status_from_str(&status_str),
        author_id: row.try_get("author_id")?,
        author_username: row.try_get("author_username").ok(),
        created_at: row.try_get("created_at")?,
        updated_at: row.try_get("updated_at")?,
    })
}

#[tracing::instrument(name = "Fetch all blog posts from database", skip(pool))]
pub async fn get_all_posts(pool: &PgPool) -> Result<Vec<BlogPost>, sqlx::Error> {
    let posts = sqlx::query!(
        r#"
        SELECT 
            bp.id,
            bp.title,
            bp.content,
            bp.status,
            bp.author_id,
            u.username as author_username,
            bp.created_at,
            bp.updated_at
        FROM blog_posts bp
        INNER JOIN users u ON bp.author_id = u.user_id
        ORDER BY bp.created_at DESC
        "#
    )
    .fetch_all(pool)
    .await?
    .into_iter()
    .map(|row| BlogPost {
        id: row.id,
        title: row.title,
        content: row.content,
        status: status_from_str(&row.status),
        author_id: row.author_id,
        author_username: Some(row.author_username),
        created_at: row.created_at,
        updated_at: row.updated_at,
    })
    .collect();

    Ok(posts)
}

#[tracing::instrument(name = "Insert blog post into database", skip(pool))]
pub async fn insert_post(
    pool: &PgPool,
    title: &str,
    content: &str,
    status: &BlogPostStatus,
    author_id: Uuid,
) -> Result<BlogPost, sqlx::Error> {
    let post_id = Uuid::new_v4();
    let status_str = status.as_str();

    let row = sqlx::query!(
        r#"
        INSERT INTO blog_posts (id, title, content, status, author_id)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, title, content, status, author_id, created_at, updated_at
        "#,
        post_id,
        title,
        content,
        status_str,
        author_id
    )
    .fetch_one(pool)
    .await?;

    Ok(BlogPost {
        id: row.id,
        title: row.title,
        content: row.content,
        status: status_from_str(&row.status),
        author_id: row.author_id,
        author_username: None,
        created_at: row.created_at,
        updated_at: row.updated_at,
    })
}

#[tracing::instrument(name = "Update blog post in database", skip(pool))]
pub async fn update_post(
    pool: &PgPool,
    post_id: Uuid,
    title: &str,
    content: &str,
    status: &BlogPostStatus,
) -> Result<BlogPost, sqlx::Error> {
    let status_str = status.as_str();

    let row = sqlx::query!(
        r#"
        UPDATE blog_posts
        SET title = $2, content = $3, status = $4, updated_at = NOW()
        WHERE id = $1
        RETURNING id, title, content, status, author_id, created_at, updated_at
        "#,
        post_id,
        title,
        content,
        status_str
    )
    .fetch_one(pool)
    .await?;

    Ok(BlogPost {
        id: row.id,
        title: row.title,
        content: row.content,
        status: status_from_str(&row.status),
        author_id: row.author_id,
        author_username: None,
        created_at: row.created_at,
        updated_at: row.updated_at,
    })
}

pub struct DeletePostResult {
    pub is_actual_deletion: bool,
    pub title: String,
}

#[tracing::instrument(name = "Delete blog post from database", skip(pool))]
pub async fn delete_post(pool: &PgPool, post_id: Uuid) -> Result<DeletePostResult, sqlx::Error> {
    // First, try to get the post title
    let post_title = sqlx::query!(
        r#"
        SELECT title
        FROM blog_posts
        WHERE id = $1
        "#,
        post_id
    )
    .fetch_optional(pool)
    .await?;

    // If post doesn't exist, return early
    let title = match post_title {
        Some(record) => record.title,
        None => {
            return Ok(DeletePostResult {
                is_actual_deletion: false,
                title: String::new(),
            });
        }
    };

    // Post exists, attempt to delete it
    let result = sqlx::query!(
        r#"
        DELETE FROM blog_posts
        WHERE id = $1
        "#,
        post_id
    )
    .execute(pool)
    .await?;

    Ok(DeletePostResult {
        is_actual_deletion: result.rows_affected() > 0,
        title,
    })
}
