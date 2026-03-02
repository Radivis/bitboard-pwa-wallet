use crate::common::function_name;
use crate::common::spawn_app;
use crate::common::{assert_subscription_confirm_redirect, mount_mock_email_server};

#[tokio::test]
async fn confirmations_without_token_are_rejected_with_a_400() {
    // Arrange
    let app = spawn_app(function_name!()).await;
    // Act
    let response = reqwest::get(&format!("{}/api/subscriptions/confirm", app.address))
        .await
        .unwrap();
    // Assert
    assert_eq!(response.status().as_u16(), 400);
}

#[tokio::test]
async fn confirmations_with_malformed_token_are_rejected_with_a_400() {
    // Arrange
    let app = spawn_app(function_name!()).await;
    let malformed_token = "not-a-valid-uuid";

    // Act
    let response = reqwest::get(&format!(
        "{}/api/subscriptions/confirm?subscription_token={}",
        app.address, malformed_token
    ))
    .await
    .unwrap();

    // Assert
    assert_eq!(response.status().as_u16(), 400);
}

#[tokio::test]
async fn confirmations_with_nonexistent_token_are_rejected_with_a_401() {
    // Arrange
    let app = spawn_app(function_name!()).await;
    // Valid UUID format but doesn't exist in database
    let nonexistent_token = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6";

    // Act
    let response = reqwest::get(&format!(
        "{}/api/subscriptions/confirm?subscription_token={}",
        app.address, nonexistent_token
    ))
    .await
    .unwrap();

    // Assert
    assert_eq!(response.status().as_u16(), 401);
}

#[tokio::test]
async fn the_link_returned_by_subscribe_returns_a_303_redirect_if_called() {
    // Arrange
    let app = spawn_app(function_name!()).await;
    let body = serde_json::json!({
        "name": "le guin",
        "email": "ursula_le_guin@gmail.com"
    });
    let _ = mount_mock_email_server(&app.email_server, None).await;
    app.post_subscriptions(&body).await;

    let email_request = &app.email_server.received_requests().await.unwrap()[0];
    let confirmation_links = app.get_confirmation_links(email_request);
    // Act - use api_client which does not follow redirects (backend redirects to /subscribed)
    let response = app
        .api_client
        .get(confirmation_links.html.as_str())
        .send()
        .await
        .unwrap();
    // Assert - 303 See Other redirect to /subscribed
    assert_subscription_confirm_redirect(&response);
}

#[tokio::test]
async fn clicking_on_the_confirmation_link_confirms_a_subscriber() {
    // Arrange
    let app = spawn_app(function_name!()).await;
    let body = serde_json::json!({
        "name": "le guin",
        "email": "ursula_le_guin@gmail.com"
    });
    let _ = mount_mock_email_server(&app.email_server, None).await;
    app.post_subscriptions(&body).await;
    let email_request = &app.email_server.received_requests().await.unwrap()[0];
    let confirmation_links = app.get_confirmation_links(email_request);
    // Act - use api_client which does not follow redirects (backend redirects to /subscribed)
    let response = app
        .api_client
        .get(confirmation_links.html.as_str())
        .send()
        .await
        .unwrap();
    assert_subscription_confirm_redirect(&response);
    // Assert
    let saved = sqlx::query!("SELECT email, name, status FROM subscriptions",)
        .fetch_one(&app.db_connection_pool)
        .await
        .expect("Failed to fetch saved subscription.");

    assert_eq!(saved.email, "ursula_le_guin@gmail.com");
    assert_eq!(saved.name, "le guin");
    assert_eq!(saved.status, "confirmed");
}
