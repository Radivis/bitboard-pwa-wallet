use crate::common::function_name;
use crate::common::{assert_is_json_error, assert_json_response};
use crate::common::{spawn_app, spawn_app_container_with_user};
use uuid::Uuid;
#[tokio::test]
async fn you_must_be_logged_in_to_see_the_change_password_form() {
    // Arrange
    let app = spawn_app(function_name!()).await;
    // Act - Try to access change password endpoint without auth
    let response = app
        .api_client
        .post(format!("{}/api/admin/password", &app.address))
        .json(&serde_json::json!({
            "current_password": "test",
            "new_password": "test",
            "new_password_check": "test",
        }))
        .send()
        .await
        .expect("Failed to execute request.");
    // Assert - Should return 401 JSON error
    assert_is_json_error(&response, 401);
    let error_body: serde_json::Value = assert_json_response(response).await;
    assert!(!error_body["success"].as_bool().unwrap());
}

#[tokio::test]
async fn you_must_be_logged_in_to_change_your_password() {
    // Arrange
    let container = spawn_app_container_with_user(function_name!()).await;
    let new_password = Uuid::new_v4().to_string();
    // Act
    let response = container
        .app
        .post_change_password(&serde_json::json!({
            "current_password": Uuid::new_v4().to_string(),
            "new_password": &new_password,
            "new_password_check": &new_password,
        }))
        .await;

    // Assert - Should return 401 JSON error
    assert_is_json_error(&response, 401);
    let error_body: serde_json::Value = assert_json_response(response).await;
    assert!(!error_body["success"].as_bool().unwrap());
}

#[tokio::test]
async fn new_password_fields_must_match() {
    // Arrange
    let container = spawn_app_container_with_user(function_name!())
        .await
        .login()
        .await;
    let new_password = Uuid::new_v4().to_string();
    let another_new_password = Uuid::new_v4().to_string();

    // Act - Try to change password with mismatched passwords
    let response = container
        .app
        .post_change_password(&serde_json::json!({
            "current_password": &container.test_user.password,
            "new_password": &new_password,
            "new_password_check": &another_new_password,
        }))
        .await;

    // Assert - Should return 400 JSON error
    assert_is_json_error(&response, 400);
    let error_body: serde_json::Value = assert_json_response(response).await;
    assert!(!error_body["success"].as_bool().unwrap());
    assert!(
        error_body["error"]
            .as_str()
            .unwrap()
            .contains("two different new passwords")
    );
}

#[tokio::test]
async fn current_password_must_be_valid() {
    // Arrange
    let container = spawn_app_container_with_user(function_name!())
        .await
        .login()
        .await;
    let new_password = Uuid::new_v4().to_string();
    let wrong_password = Uuid::new_v4().to_string();

    // Act - Try to change password with wrong current password
    let response = container
        .app
        .post_change_password(&serde_json::json!({
            "current_password": &wrong_password,
            "new_password": &new_password,
            "new_password_check": &new_password,
        }))
        .await;

    // Assert - Should return 401 JSON error
    assert_is_json_error(&response, 401);
    let error_body: serde_json::Value = assert_json_response(response).await;
    assert!(!error_body["success"].as_bool().unwrap());
    assert!(
        error_body["error"]
            .as_str()
            .unwrap()
            .contains("current password is incorrect")
    );
}

#[tokio::test]
async fn new_password_must_have_at_least_12_characters() {
    // Arrange
    let container = spawn_app_container_with_user(function_name!())
        .await
        .login()
        .await;
    let new_password = "0123456789 a";

    // Act - Try to change password with too short password
    let response = container
        .app
        .post_change_password(&serde_json::json!({
            "current_password": &container.test_user.password,
            "new_password": &new_password,
            "new_password_check": &new_password,
        }))
        .await;

    // Assert - Should return 400 JSON error
    assert_is_json_error(&response, 400);
    let error_body: serde_json::Value = assert_json_response(response).await;
    assert!(!error_body["success"].as_bool().unwrap());
    assert!(
        error_body["error"]
            .as_str()
            .unwrap()
            .contains("at least 12 characters besides spaces")
    );
}

#[tokio::test]
async fn new_password_must_not_have_more_than_128_characters() {
    // Arrange
    let container = spawn_app_container_with_user(function_name!())
        .await
        .login()
        .await;
    let new_password = "12345678".repeat(16) + ".";

    // Act - Try to change password with too long password
    let response = container
        .app
        .post_change_password(&serde_json::json!({
            "current_password": &container.test_user.password,
            "new_password": &new_password,
            "new_password_check": &new_password,
        }))
        .await;

    // Assert - Should return 400 JSON error
    assert_is_json_error(&response, 400);
    let error_body: serde_json::Value = assert_json_response(response).await;
    assert!(!error_body["success"].as_bool().unwrap());
    assert!(
        error_body["error"]
            .as_str()
            .unwrap()
            .contains("not have more than 128 characters")
    );
}

#[tokio::test]
async fn changing_password_works() {
    // Arrange
    let container = spawn_app_container_with_user(function_name!())
        .await
        .login()
        .await;
    let new_password = Uuid::new_v4().to_string();

    // Act - Part 1 - Change password
    let response = container
        .app
        .post_change_password(&serde_json::json!({
            "current_password": &container.test_user.password,
            "new_password": &new_password,
            "new_password_check": &new_password,
        }))
        .await;

    // Assert - Should return 200 JSON success
    assert_eq!(response.status().as_u16(), 200);
    let success_body: serde_json::Value = assert_json_response(response).await;
    assert!(success_body["success"].as_bool().unwrap());
    assert!(success_body["error"].is_null());

    // Act - Part 2 - Logout
    let logout_response = container.app.post_logout().await;
    assert_eq!(logout_response.status().as_u16(), 200);
    let logout_body: serde_json::Value = assert_json_response(logout_response).await;
    assert!(logout_body["success"].as_bool().unwrap());

    // Act - Part 3 - Login using the new password
    let login_body = serde_json::json!({
        "username": &container.test_user.username,
        "password": &new_password
    });

    let login_response = container.app.post_login_json(&login_body).await;
    assert_eq!(login_response.status().as_u16(), 200);
    let login_response_body: serde_json::Value = assert_json_response(login_response).await;
    assert!(login_response_body["success"].as_bool().unwrap());
}
