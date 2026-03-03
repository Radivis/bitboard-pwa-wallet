use crate::common::function_name;
use crate::common::{spawn_app, spawn_app_container_with_user};
#[tokio::test]
async fn create_initial_admin_when_no_users_exist() {
    // Arrange
    let app = spawn_app(function_name!()).await;

    // Delete any seeded users from migrations
    sqlx::query!("DELETE FROM users")
        .execute(&app.db_connection_pool)
        .await
        .expect("Failed to delete seeded users");

    // Verify no users exist
    let users_count: i64 = sqlx::query_scalar!("SELECT COUNT(*) FROM users")
        .fetch_one(&app.db_connection_pool)
        .await
        .expect("Failed to query users count")
        .unwrap_or(0);
    assert_eq!(users_count, 0);

    // Act - Create initial admin
    let password = "test_password_123";
    let response = app
        .post_initial_password(&serde_json::json!({
            "username": "admin",
            "password": password,
            "password_confirmation": password
        }))
        .await;

    // Assert - Should return success JSON
    assert_eq!(response.status().as_u16(), 201);
    let response_body: serde_json::Value = response.json().await.expect("Failed to parse response");
    assert!(response_body["success"].as_bool().unwrap());
    assert_eq!(response_body["username"].as_str().unwrap(), "admin");

    // Verify admin user was created
    let user = sqlx::query!("SELECT username FROM users WHERE username = 'admin'")
        .fetch_one(&app.db_connection_pool)
        .await
        .expect("Failed to query admin user");
    assert_eq!(user.username, "admin");

    // Verify we can now login with the created admin
    let login_response = app
        .post_login_json(&serde_json::json!({
            "username": "admin",
            "password": password
        }))
        .await;
    assert_eq!(login_response.status().as_u16(), 200);
}

#[tokio::test]
async fn reject_initial_password_when_users_already_exist() {
    // Arrange - Create a user first
    let container = spawn_app_container_with_user(function_name!()).await;

    // Act - Try to create initial admin
    let response = container
        .app
        .post_initial_password(&serde_json::json!({
            "username": "admin",
            "password": "test_password_123",
            "password_confirmation": "test_password_123"
        }))
        .await;

    // Assert - Should return error
    assert_eq!(response.status().as_u16(), 400);
    let error_body: serde_json::Value = response.json().await.expect("Failed to parse response");
    assert_eq!(
        error_body["error"].as_str().unwrap(),
        "Users already exist. Initial password setup is only available when no users exist."
    );
}

#[tokio::test]
async fn reject_when_passwords_do_not_match() {
    // Arrange
    let app = spawn_app(function_name!()).await;
    // Delete any seeded users from migrations
    sqlx::query!("DELETE FROM users")
        .execute(&app.db_connection_pool)
        .await
        .expect("Failed to delete seeded users");

    // Act - Try to create initial admin with mismatched passwords
    let response = app
        .post_initial_password(&serde_json::json!({
            "username": "admin",
            "password": "test_password_123",
            "password_confirmation": "different_password_456"
        }))
        .await;

    // Assert - Should return error
    assert_eq!(response.status().as_u16(), 400);
    let error_body: serde_json::Value = response.json().await.expect("Failed to parse response");
    assert_eq!(
        error_body["error"].as_str().unwrap(),
        "You entered two different passwords - the field values must match."
    );
}

#[tokio::test]
async fn reject_password_too_short() {
    // Arrange
    let app = spawn_app(function_name!()).await;
    // Delete any seeded users from migrations
    sqlx::query!("DELETE FROM users")
        .execute(&app.db_connection_pool)
        .await
        .expect("Failed to delete seeded users");

    // Act - Try to create initial admin with password that's too short (excluding spaces)
    let response = app
        .post_initial_password(&serde_json::json!({
            "username": "admin",
            "password": "0123456789 a", // 11 chars excluding space
            "password_confirmation": "0123456789 a"
        }))
        .await;

    // Assert - Should return error
    assert_eq!(response.status().as_u16(), 400);
    let error_body: serde_json::Value = response.json().await.expect("Failed to parse response");
    assert_eq!(
        error_body["error"].as_str().unwrap(),
        "The password must have at least 12 characters besides spaces."
    );
}

#[tokio::test]
async fn reject_password_too_long() {
    // Arrange
    let app = spawn_app(function_name!()).await;
    // Delete any seeded users from migrations
    sqlx::query!("DELETE FROM users")
        .execute(&app.db_connection_pool)
        .await
        .expect("Failed to delete seeded users");

    // Act - Try to create initial admin with password that's too long
    let long_password = "a".repeat(129); // 129 characters
    let response = app
        .post_initial_password(&serde_json::json!({
            "username": "admin",
            "password": &long_password,
            "password_confirmation": &long_password
        }))
        .await;

    // Assert - Should return error
    assert_eq!(response.status().as_u16(), 400);
    let error_body: serde_json::Value = response.json().await.expect("Failed to parse response");
    assert_eq!(
        error_body["error"].as_str().unwrap(),
        "The password must not have more than 128 characters."
    );
}

#[tokio::test]
async fn check_users_exist_endpoint_returns_false_when_no_users() {
    // Arrange
    let app = spawn_app(function_name!()).await;
    // Delete any seeded users from migrations
    sqlx::query!("DELETE FROM users")
        .execute(&app.db_connection_pool)
        .await
        .expect("Failed to delete seeded users");

    // Act
    let response = app.get_users_exist().await;

    // Assert
    assert_eq!(response.status().as_u16(), 200);
    let body: serde_json::Value = response.json().await.expect("Failed to parse response");
    assert!(!body["users_exist"].as_bool().unwrap());
}

#[tokio::test]
async fn check_users_exist_endpoint_returns_true_when_users_exist() {
    // Arrange
    let container = spawn_app_container_with_user(function_name!()).await;

    // Act
    let response = container.app.get_users_exist().await;

    // Assert
    assert_eq!(response.status().as_u16(), 200);
    let body: serde_json::Value = response.json().await.expect("Failed to parse response");
    assert!(body["users_exist"].as_bool().unwrap());
}

#[tokio::test]
async fn can_login_after_creating_initial_admin() {
    // Arrange
    let app = spawn_app(function_name!()).await;
    // Delete any seeded users from migrations
    sqlx::query!("DELETE FROM users")
        .execute(&app.db_connection_pool)
        .await
        .expect("Failed to delete seeded users");
    let password = "secure_password_12345";

    // Act - Create initial admin
    let create_response = app
        .post_initial_password(&serde_json::json!({
            "username": "admin",
            "password": password,
            "password_confirmation": password
        }))
        .await;
    assert_eq!(create_response.status().as_u16(), 201);
    let create_body: serde_json::Value = create_response
        .json()
        .await
        .expect("Failed to parse response");
    assert!(create_body["success"].as_bool().unwrap());

    // Act - Login with created admin
    let login_response = app
        .post_login_json(&serde_json::json!({
            "username": "admin",
            "password": password
        }))
        .await;

    // Assert - Login should succeed
    assert_eq!(login_response.status().as_u16(), 200);
    let login_body: serde_json::Value = login_response
        .json()
        .await
        .expect("Failed to parse response");
    assert!(login_body["success"].as_bool().unwrap());
}

#[tokio::test]
async fn password_with_spaces_is_valid_if_non_space_chars_meet_minimum() {
    // Arrange
    let app = spawn_app(function_name!()).await;
    // Delete any seeded users from migrations
    sqlx::query!("DELETE FROM users")
        .execute(&app.db_connection_pool)
        .await
        .expect("Failed to delete seeded users");
    let password = "a b c d e f g h i j k l"; // 12 non-space characters

    // Act - Create initial admin
    let response = app
        .post_initial_password(&serde_json::json!({
            "username": "admin",
            "password": password,
            "password_confirmation": password
        }))
        .await;

    // Assert - Should succeed with JSON response
    assert_eq!(response.status().as_u16(), 201);
    let response_body: serde_json::Value = response.json().await.expect("Failed to parse response");
    assert!(response_body["success"].as_bool().unwrap());
    assert_eq!(response_body["username"].as_str().unwrap(), "admin");

    // Verify admin user was created
    let user = sqlx::query!("SELECT username FROM users WHERE username = 'admin'")
        .fetch_one(&app.db_connection_pool)
        .await
        .expect("Failed to query admin user");
    assert_eq!(user.username, "admin");
}
