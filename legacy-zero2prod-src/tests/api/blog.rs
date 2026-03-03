use crate::common::function_name;
use crate::common::{assert_is_json_error, assert_json_response, create_blog_post};
use crate::common::{spawn_app, spawn_app_container_with_user};
use uuid::Uuid;

// ==================== Authentication Tests ====================

#[tokio::test]
async fn admin_get_all_posts_requires_auth() {
    // Arrange
    let app = spawn_app(function_name!()).await;

    // Act
    let response = app.admin_get_all_posts().await;

    // Assert
    assert_is_json_error(&response, 401);
    let error_body: serde_json::Value = assert_json_response(response).await;
    assert!(!error_body["success"].as_bool().unwrap());
    assert!(
        error_body["error"]
            .as_str()
            .unwrap()
            .contains("Authentication required")
    );
}

#[tokio::test]
async fn admin_get_post_by_id_requires_auth() {
    // Arrange
    let app = spawn_app(function_name!()).await;
    let post_id = Uuid::new_v4();

    // Act
    let response = app.admin_get_post_by_id(post_id).await;

    // Assert
    assert_is_json_error(&response, 401);
    let error_body: serde_json::Value = assert_json_response(response).await;
    assert!(!error_body["success"].as_bool().unwrap());
    assert!(
        error_body["error"]
            .as_str()
            .unwrap()
            .contains("Authentication required")
    );
}

#[tokio::test]
async fn admin_create_post_requires_auth() {
    // Arrange
    let app = spawn_app(function_name!()).await;
    let body = serde_json::json!({
        "title": "Test Post",
        "content": "Test content",
        "status": "draft"
    });

    // Act
    let response = app.admin_create_post(&body).await;

    // Assert
    assert_is_json_error(&response, 401);
    let error_body: serde_json::Value = assert_json_response(response).await;
    assert!(!error_body["success"].as_bool().unwrap());
    assert!(
        error_body["error"]
            .as_str()
            .unwrap()
            .contains("Authentication required")
    );
}

#[tokio::test]
async fn admin_update_post_requires_auth() {
    // Arrange
    let app = spawn_app(function_name!()).await;
    let post_id = Uuid::new_v4();
    let body = serde_json::json!({
        "title": "Updated Title",
        "content": "Updated content",
        "status": "published"
    });

    // Act
    let response = app.admin_update_post(post_id, &body).await;

    // Assert
    assert_is_json_error(&response, 401);
    let error_body: serde_json::Value = assert_json_response(response).await;
    assert!(!error_body["success"].as_bool().unwrap());
    assert!(
        error_body["error"]
            .as_str()
            .unwrap()
            .contains("Authentication required")
    );
}

#[tokio::test]
async fn admin_delete_post_requires_auth() {
    // Arrange
    let app = spawn_app(function_name!()).await;
    let post_id = Uuid::new_v4();

    // Act
    let response = app.admin_delete_post(post_id).await;

    // Assert
    assert_is_json_error(&response, 401);
    let error_body: serde_json::Value = assert_json_response(response).await;
    assert!(!error_body["success"].as_bool().unwrap());
    assert!(
        error_body["error"]
            .as_str()
            .unwrap()
            .contains("Authentication required")
    );
}

// ==================== Input Validation Tests ====================

#[tokio::test]
async fn create_post_rejects_missing_title() {
    // Arrange
    let container = spawn_app_container_with_user(function_name!())
        .await
        .login()
        .await;
    let body = serde_json::json!({
        "content": "Test content",
        "status": "draft"
    });

    // Act
    let response = container.app.admin_create_post(&body).await;

    // Assert
    assert_eq!(
        response.status().as_u16(),
        422,
        "The API did not return 422 when title was missing"
    );
}

#[tokio::test]
async fn create_post_rejects_missing_content() {
    // Arrange
    let container = spawn_app_container_with_user(function_name!())
        .await
        .login()
        .await;
    let body = serde_json::json!({
        "title": "Test Post",
        "status": "draft"
    });

    // Act
    let response = container.app.admin_create_post(&body).await;

    // Assert
    assert_eq!(
        response.status().as_u16(),
        422,
        "The API did not return 422 when content was missing"
    );
}

#[tokio::test]
async fn create_post_rejects_missing_status() {
    // Arrange
    let container = spawn_app_container_with_user(function_name!())
        .await
        .login()
        .await;
    let body = serde_json::json!({
        "title": "Test Post",
        "content": "Test content"
    });

    // Act
    let response = container.app.admin_create_post(&body).await;

    // Assert
    assert_eq!(
        response.status().as_u16(),
        422,
        "The API did not return 422 when status was missing"
    );
}

#[tokio::test]
async fn create_post_rejects_invalid_status() {
    // Arrange
    let container = spawn_app_container_with_user(function_name!())
        .await
        .login()
        .await;
    let body = serde_json::json!({
        "title": "Test Post",
        "content": "Test content",
        "status": "invalid_status"
    });

    // Act
    let response = container.app.admin_create_post(&body).await;

    // Assert - Deserialization errors return 422
    assert_eq!(
        response.status().as_u16(),
        422,
        "The API did not return 422 when status was invalid"
    );
}

#[tokio::test]
async fn update_post_rejects_missing_title() {
    // Arrange
    let container = spawn_app_container_with_user(function_name!())
        .await
        .login()
        .await;
    let post_id = Uuid::new_v4();
    let body = serde_json::json!({
        "content": "Updated content",
        "status": "published"
    });

    // Act
    let response = container.app.admin_update_post(post_id, &body).await;

    // Assert
    assert_eq!(
        response.status().as_u16(),
        422,
        "The API did not return 422 when title was missing"
    );
}

#[tokio::test]
async fn update_post_rejects_missing_content() {
    // Arrange
    let container = spawn_app_container_with_user(function_name!())
        .await
        .login()
        .await;
    let post_id = Uuid::new_v4();
    let body = serde_json::json!({
        "title": "Updated Title",
        "status": "published"
    });

    // Act
    let response = container.app.admin_update_post(post_id, &body).await;

    // Assert
    assert_eq!(
        response.status().as_u16(),
        422,
        "The API did not return 422 when content was missing"
    );
}

#[tokio::test]
async fn update_post_rejects_missing_status() {
    // Arrange
    let container = spawn_app_container_with_user(function_name!())
        .await
        .login()
        .await;
    let post_id = Uuid::new_v4();
    let body = serde_json::json!({
        "title": "Updated Title",
        "content": "Updated content"
    });

    // Act
    let response = container.app.admin_update_post(post_id, &body).await;

    // Assert
    assert_eq!(
        response.status().as_u16(),
        422,
        "The API did not return 422 when status was missing"
    );
}

#[tokio::test]
async fn update_post_rejects_invalid_status() {
    // Arrange
    let container = spawn_app_container_with_user(function_name!())
        .await
        .login()
        .await;
    let post_id = Uuid::new_v4();
    let body = serde_json::json!({
        "title": "Updated Title",
        "content": "Updated content",
        "status": "invalid_status"
    });

    // Act
    let response = container.app.admin_update_post(post_id, &body).await;

    // Assert - Deserialization errors return 422
    assert_eq!(
        response.status().as_u16(),
        422,
        "The API did not return 422 when status was invalid"
    );
}

// ==================== Invalid ID Tests ====================

#[tokio::test]
async fn get_post_by_id_returns_404_for_nonexistent_post() {
    // Arrange
    let app = spawn_app(function_name!()).await;
    let nonexistent_post_id = Uuid::new_v4();

    // Act
    let response = app.get_post_by_id(nonexistent_post_id).await;

    // Assert
    assert_eq!(
        response.status().as_u16(),
        404,
        "The API did not return 404 for a nonexistent post ID on public endpoint"
    );
}

#[tokio::test]
async fn admin_get_post_by_id_returns_404_for_nonexistent_post() {
    // Arrange
    let container = spawn_app_container_with_user(function_name!())
        .await
        .login()
        .await;
    let nonexistent_post_id = Uuid::new_v4();

    // Act
    let response = container
        .app
        .admin_get_post_by_id(nonexistent_post_id)
        .await;

    // Assert
    assert_eq!(
        response.status().as_u16(),
        404,
        "The API did not return 404 for a nonexistent post ID on admin get endpoint"
    );
}

#[tokio::test]
async fn admin_update_post_returns_404_for_nonexistent_post() {
    // Arrange
    let container = spawn_app_container_with_user(function_name!())
        .await
        .login()
        .await;
    let nonexistent_post_id = Uuid::new_v4();
    let body = serde_json::json!({
        "title": "Updated Title",
        "content": "Updated content",
        "status": "published"
    });

    // Act
    let response = container
        .app
        .admin_update_post(nonexistent_post_id, &body)
        .await;

    // Assert
    assert_eq!(
        response.status().as_u16(),
        404,
        "The API did not return 404 when updating a nonexistent post"
    );
}

#[tokio::test]
async fn admin_delete_nonexistent_post_returns_200() {
    // Arrange
    let container = spawn_app_container_with_user(function_name!())
        .await
        .login()
        .await;
    let nonexistent_post_id = Uuid::new_v4();

    // Act
    let response = container.app.admin_delete_post(nonexistent_post_id).await;

    // Assert - DELETE succeeds with 200, but is_actual_deletion is false
    assert_eq!(
        response.status().as_u16(),
        200,
        "The API did not return 200 when deleting a nonexistent post"
    );

    let body: serde_json::Value = assert_json_response(response).await;
    assert!(
        !body["is_actual_deletion"].as_bool().unwrap(),
        "is_actual_deletion should be false when post doesn't exist"
    );
    assert_eq!(
        body["title"].as_str().unwrap(),
        "",
        "title should be empty when post doesn't exist"
    );
}

// ==================== Critical Privacy/Security Tests ====================

#[tokio::test]
async fn get_published_posts_excludes_draft_posts() {
    // Arrange
    let container = spawn_app_container_with_user(function_name!())
        .await
        .login()
        .await;

    // Create one published and one draft post
    let published_post_id = create_blog_post(
        &container.app.db_connection_pool,
        "Published Post",
        "This is published content",
        "published",
        container.test_user.user_id,
    )
    .await;

    let draft_post_id = create_blog_post(
        &container.app.db_connection_pool,
        "Draft Post",
        "This is draft content",
        "draft",
        container.test_user.user_id,
    )
    .await;

    // Act - Get published posts via public endpoint
    let response = container.app.get_published_posts().await;

    // Assert
    assert_eq!(response.status().as_u16(), 200);
    let posts: Vec<serde_json::Value> = assert_json_response(response).await;

    // Verify only published post is returned
    assert_eq!(
        posts.len(),
        1,
        "Expected exactly 1 published post, got {}",
        posts.len()
    );

    let returned_post_id = Uuid::parse_str(posts[0]["id"].as_str().unwrap()).unwrap();
    assert_eq!(
        returned_post_id, published_post_id,
        "Expected published post to be returned"
    );

    // Verify draft post is NOT in the response
    assert!(
        !posts
            .iter()
            .any(|p| Uuid::parse_str(p["id"].as_str().unwrap()).unwrap() == draft_post_id),
        "Draft post should not be visible in public endpoint"
    );

    // Verify the status field is published
    assert_eq!(posts[0]["status"].as_str().unwrap(), "published");
}

#[tokio::test]
async fn get_post_by_id_excludes_draft_posts() {
    // Arrange
    let container = spawn_app_container_with_user(function_name!())
        .await
        .login()
        .await;

    // Create a draft post
    let draft_post_id = create_blog_post(
        &container.app.db_connection_pool,
        "Draft Post",
        "This is draft content",
        "draft",
        container.test_user.user_id,
    )
    .await;

    // Act - Try to get draft post via public endpoint
    let response = container.app.get_post_by_id(draft_post_id).await;

    // Assert - Should return 404 (not 403, which would leak existence)
    assert_eq!(
        response.status().as_u16(),
        404,
        "Draft post should return 404 on public endpoint, not expose its existence"
    );
}

// ==================== Happy Path Tests ====================

#[tokio::test]
async fn get_published_posts_returns_200() {
    // Arrange
    let container = spawn_app_container_with_user(function_name!())
        .await
        .login()
        .await;

    // Create a published post
    create_blog_post(
        &container.app.db_connection_pool,
        "Test Post",
        "Test content",
        "published",
        container.test_user.user_id,
    )
    .await;

    // Act
    let response = container.app.get_published_posts().await;

    // Assert
    assert_eq!(response.status().as_u16(), 200);
    let posts: Vec<serde_json::Value> = assert_json_response(response).await;
    assert!(!posts.is_empty(), "Expected at least one published post");

    // Verify structure of response
    let post = &posts[0];
    assert!(post["id"].is_string());
    assert!(post["title"].is_string());
    assert!(post["content"].is_string());
    assert_eq!(post["status"].as_str().unwrap(), "published");
    assert!(post["author_username"].is_string());
    assert!(post["created_at"].is_string());
    assert!(post["updated_at"].is_string());
}

#[tokio::test]
async fn get_post_by_id_returns_published_post() {
    // Arrange
    let container = spawn_app_container_with_user(function_name!())
        .await
        .login()
        .await;

    let post_id = create_blog_post(
        &container.app.db_connection_pool,
        "Test Post",
        "Test content",
        "published",
        container.test_user.user_id,
    )
    .await;

    // Act
    let response = container.app.get_post_by_id(post_id).await;

    // Assert
    assert_eq!(response.status().as_u16(), 200);
    let post: serde_json::Value = assert_json_response(response).await;

    assert_eq!(
        Uuid::parse_str(post["id"].as_str().unwrap()).unwrap(),
        post_id
    );
    assert_eq!(post["title"].as_str().unwrap(), "Test Post");
    assert_eq!(post["content"].as_str().unwrap(), "Test content");
    assert_eq!(post["status"].as_str().unwrap(), "published");
}

#[tokio::test]
async fn admin_get_all_posts_includes_drafts_and_published() {
    // Arrange
    let container = spawn_app_container_with_user(function_name!())
        .await
        .login()
        .await;

    // Create both draft and published posts
    let draft_post_id = create_blog_post(
        &container.app.db_connection_pool,
        "Draft Post",
        "Draft content",
        "draft",
        container.test_user.user_id,
    )
    .await;

    let published_post_id = create_blog_post(
        &container.app.db_connection_pool,
        "Published Post",
        "Published content",
        "published",
        container.test_user.user_id,
    )
    .await;

    // Act
    let response = container.app.admin_get_all_posts().await;

    // Assert
    assert_eq!(response.status().as_u16(), 200);
    let posts: Vec<serde_json::Value> = assert_json_response(response).await;

    assert!(
        posts.len() >= 2,
        "Expected at least 2 posts (draft and published)"
    );

    // Verify both posts are present
    let post_ids: Vec<Uuid> = posts
        .iter()
        .map(|p| Uuid::parse_str(p["id"].as_str().unwrap()).unwrap())
        .collect();

    assert!(
        post_ids.contains(&draft_post_id),
        "Draft post should be visible in admin endpoint"
    );
    assert!(
        post_ids.contains(&published_post_id),
        "Published post should be visible in admin endpoint"
    );
}

#[tokio::test]
async fn admin_get_post_by_id_returns_any_status() {
    // Arrange
    let container = spawn_app_container_with_user(function_name!())
        .await
        .login()
        .await;

    // Create a draft post
    let draft_post_id = create_blog_post(
        &container.app.db_connection_pool,
        "Draft Post",
        "Draft content",
        "draft",
        container.test_user.user_id,
    )
    .await;

    // Act - Admin should be able to get draft post
    let response = container.app.admin_get_post_by_id(draft_post_id).await;

    // Assert
    assert_eq!(response.status().as_u16(), 200);
    let post: serde_json::Value = assert_json_response(response).await;

    assert_eq!(
        Uuid::parse_str(post["id"].as_str().unwrap()).unwrap(),
        draft_post_id
    );
    assert_eq!(post["status"].as_str().unwrap(), "draft");
}

#[tokio::test]
async fn admin_create_post_returns_201() {
    // Arrange
    let container = spawn_app_container_with_user(function_name!())
        .await
        .login()
        .await;

    let body = serde_json::json!({
        "title": "New Post",
        "content": "New content",
        "status": "draft"
    });

    // Act
    let response = container.app.admin_create_post(&body).await;

    // Assert
    assert_eq!(response.status().as_u16(), 201);
    let post: serde_json::Value = assert_json_response(response).await;

    assert_eq!(post["title"].as_str().unwrap(), "New Post");
    assert_eq!(post["content"].as_str().unwrap(), "New content");
    assert_eq!(post["status"].as_str().unwrap(), "draft");
    assert!(post["id"].is_string());
}

#[tokio::test]
async fn admin_create_draft_post_returns_201() {
    // Arrange
    let container = spawn_app_container_with_user(function_name!())
        .await
        .login()
        .await;

    let body = serde_json::json!({
        "title": "Draft Post",
        "content": "Draft content",
        "status": "draft"
    });

    // Act
    let response = container.app.admin_create_post(&body).await;

    // Assert
    assert_eq!(response.status().as_u16(), 201);
    let post: serde_json::Value = assert_json_response(response).await;
    assert_eq!(post["status"].as_str().unwrap(), "draft");
}

#[tokio::test]
async fn admin_create_published_post_returns_201() {
    // Arrange
    let container = spawn_app_container_with_user(function_name!())
        .await
        .login()
        .await;

    let body = serde_json::json!({
        "title": "Published Post",
        "content": "Published content",
        "status": "published"
    });

    // Act
    let response = container.app.admin_create_post(&body).await;

    // Assert
    assert_eq!(response.status().as_u16(), 201);
    let post: serde_json::Value = assert_json_response(response).await;
    assert_eq!(post["status"].as_str().unwrap(), "published");
}

#[tokio::test]
async fn admin_update_post_returns_200() {
    // Arrange
    let container = spawn_app_container_with_user(function_name!())
        .await
        .login()
        .await;

    // Create a post first
    let post_id = create_blog_post(
        &container.app.db_connection_pool,
        "Original Title",
        "Original content",
        "draft",
        container.test_user.user_id,
    )
    .await;

    let body = serde_json::json!({
        "title": "Updated Title",
        "content": "Updated content",
        "status": "draft"
    });

    // Act
    let response = container.app.admin_update_post(post_id, &body).await;

    // Assert
    assert_eq!(response.status().as_u16(), 200);
    let post: serde_json::Value = assert_json_response(response).await;

    assert_eq!(post["title"].as_str().unwrap(), "Updated Title");
    assert_eq!(post["content"].as_str().unwrap(), "Updated content");
    assert_eq!(
        Uuid::parse_str(post["id"].as_str().unwrap()).unwrap(),
        post_id
    );
}

#[tokio::test]
async fn admin_update_post_status_from_draft_to_published() {
    // Arrange
    let container = spawn_app_container_with_user(function_name!())
        .await
        .login()
        .await;

    // Create a draft post
    let post_id = create_blog_post(
        &container.app.db_connection_pool,
        "Test Post",
        "Test content",
        "draft",
        container.test_user.user_id,
    )
    .await;

    let body = serde_json::json!({
        "title": "Test Post",
        "content": "Test content",
        "status": "published"
    });

    // Act
    let response = container.app.admin_update_post(post_id, &body).await;

    // Assert
    assert_eq!(response.status().as_u16(), 200);
    let post: serde_json::Value = assert_json_response(response).await;
    assert_eq!(post["status"].as_str().unwrap(), "published");

    // Verify the post is now visible on public endpoint
    let public_response = container.app.get_post_by_id(post_id).await;
    assert_eq!(public_response.status().as_u16(), 200);
}

#[tokio::test]
async fn admin_delete_post_returns_200() {
    // Arrange
    let container = spawn_app_container_with_user(function_name!())
        .await
        .login()
        .await;

    // Create a post first
    let post_id = create_blog_post(
        &container.app.db_connection_pool,
        "Post to Delete",
        "Content to delete",
        "draft",
        container.test_user.user_id,
    )
    .await;

    // Act
    let response = container.app.admin_delete_post(post_id).await;

    // Assert
    assert_eq!(response.status().as_u16(), 200);
    let body: serde_json::Value = assert_json_response(response).await;
    assert!(
        body["is_actual_deletion"].as_bool().unwrap(),
        "is_actual_deletion should be true when post was successfully deleted"
    );
    assert_eq!(
        body["title"].as_str().unwrap(),
        "Post to Delete",
        "title should match the deleted post's title"
    );

    // Verify post is actually deleted
    let get_response = container.app.admin_get_post_by_id(post_id).await;
    assert_eq!(get_response.status().as_u16(), 404);
}

// ==================== Additional Edge Cases ====================

#[tokio::test]
async fn get_published_posts_returns_empty_array_when_no_posts() {
    // Arrange
    let app = spawn_app(function_name!()).await;

    // Act - Get posts when none exist
    let response = app.get_published_posts().await;

    // Assert
    assert_eq!(response.status().as_u16(), 200);
    let posts: Vec<serde_json::Value> = assert_json_response(response).await;
    assert!(posts.is_empty(), "Expected empty array when no posts exist");
}
