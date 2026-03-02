use crate::common::function_name;
use crate::common::{assert_is_json_error, assert_json_response};
use crate::common::{spawn_app, spawn_app_container_with_user};

#[tokio::test]
async fn an_error_message_is_returned_on_failure() {
    // Arrange
    let app = spawn_app(function_name!()).await;
    // Act
    let login_body = serde_json::json!({
        "username": "random-username",
        "password": "random-password"
    });

    let response = app.post_login_json(&login_body).await;

    // Assert - Should return 401 with JSON error
    assert_is_json_error(&response, 401);
    let error_body: serde_json::Value = assert_json_response(response).await;
    assert!(!error_body["success"].as_bool().unwrap());
    assert!(
        error_body["error"]
            .as_str()
            .unwrap()
            .contains("Authentication failed")
    );
}

#[tokio::test]
async fn returns_success_json_after_login_success() {
    // Arrange
    let container = spawn_app_container_with_user(function_name!()).await;
    // Act - Login
    let login_body = serde_json::json!({
        "username": &container.test_user.username,
        "password": &container.test_user.password
    });
    let response = container.app.post_login_json(&login_body).await;

    // Assert - Should return 200 with success JSON
    assert_eq!(response.status().as_u16(), 200);
    let login_body: serde_json::Value = assert_json_response(response).await;
    assert!(login_body["success"].as_bool().unwrap());
    assert!(login_body["error"].is_null());
}
