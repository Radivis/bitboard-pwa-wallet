use crate::common::function_name;
use crate::common::{assert_is_json_error, assert_json_response};
use crate::common::{spawn_app, spawn_app_container_with_user};

#[tokio::test]
async fn you_must_be_logged_in_to_access_the_admin_dashboard() {
    // Arrange
    let app = spawn_app(function_name!()).await;
    // Act - Try to access a protected admin endpoint (newsletters requires auth)
    let response = app
        .api_client
        .post(format!("{}/api/admin/newsletters", &app.address))
        .json(&serde_json::json!({
            "title": "Test",
            "html_content": "<p>Test</p>",
            "text_content": "Test",
            "idempotency_key": uuid::Uuid::new_v4().to_string()
        }))
        .send()
        .await
        .expect("Failed to execute request.");
    // Assert - Should return 401 JSON error
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
async fn logout_clears_session_state() {
    // Arrange
    let container = spawn_app_container_with_user(function_name!())
        .await
        .login()
        .await;

    // Act - Part 1 - Check auth endpoint works when logged in
    let auth_response = container
        .app
        .api_client
        .get(format!("{}/api/auth/me", &container.app.address))
        .send()
        .await
        .expect("Failed to execute request.");
    assert_eq!(auth_response.status().as_u16(), 200);
    let auth_body: serde_json::Value = assert_json_response(auth_response).await;
    assert!(auth_body["authenticated"].as_bool().unwrap());
    assert_eq!(
        auth_body["username"].as_str().unwrap(),
        container.test_user.username
    );

    // Act - Part 2 - Logout
    let logout_response = container.app.post_logout().await;
    assert_eq!(logout_response.status().as_u16(), 200);
    let logout_body: serde_json::Value = assert_json_response(logout_response).await;
    assert!(logout_body["success"].as_bool().unwrap());

    // Act - Part 3 - Attempt to access admin endpoint after logout
    let response = container
        .app
        .api_client
        .post(format!("{}/api/admin/newsletters", &container.app.address))
        .json(&serde_json::json!({
            "title": "Test",
            "html_content": "<p>Test</p>",
            "text_content": "Test",
            "idempotency_key": uuid::Uuid::new_v4().to_string()
        }))
        .send()
        .await
        .expect("Failed to execute request.");
    assert_is_json_error(&response, 401);
    let error_body: serde_json::Value = assert_json_response(response).await;
    assert!(!error_body["success"].as_bool().unwrap());
}
