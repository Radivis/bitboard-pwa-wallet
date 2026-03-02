use crate::common::function_name;
use crate::common::mount_mock_email_server;
use crate::common::spawn_app;

#[derive(serde::Deserialize)]
struct TokenResponse {
    token: Option<String>,
}

#[tokio::test]
async fn get_token_returns_token_for_existing_subscription() {
    let app = spawn_app(function_name!()).await;

    let body = serde_json::json!({
        "name": "Test User",
        "email": "test@example.com"
    });
    let _ = mount_mock_email_server(&app.email_server, None).await;
    app.post_subscriptions(&body).await;

    let response = app.get_test_token("test@example.com").await;

    assert_eq!(response.status().as_u16(), 200);
    let json: TokenResponse = response.json().await.unwrap();
    assert!(json.token.is_some());
    assert!(!json.token.unwrap().is_empty());
}

#[tokio::test]
async fn get_token_returns_null_for_nonexistent_email() {
    let app = spawn_app(function_name!()).await;

    let response = app.get_test_token("nonexistent@example.com").await;

    assert_eq!(response.status().as_u16(), 200);
    let json: TokenResponse = response.json().await.unwrap();
    assert!(json.token.is_none());
}

#[tokio::test]
async fn get_token_returns_400_for_missing_email_param() {
    let app = spawn_app(function_name!()).await;

    let response = app
        .api_client
        .get(format!("{}/api/test/subscription-token", app.address))
        .send()
        .await
        .expect("Failed to execute request.");

    assert_eq!(response.status().as_u16(), 400);
}

#[tokio::test]
async fn get_token_returns_token_after_confirmation() {
    let app = spawn_app(function_name!()).await;

    let body = serde_json::json!({
        "name": "Confirmed User",
        "email": "confirmed@example.com"
    });
    let _ = mount_mock_email_server(&app.email_server, None).await;
    app.post_subscriptions(&body).await;

    let email_request = &app.email_server.received_requests().await.unwrap()[0];
    let confirmation_links = app.get_confirmation_links(email_request);

    let _ = app
        .api_client
        .get(confirmation_links.html.as_str())
        .send()
        .await
        .unwrap();

    let response = app.get_test_token("confirmed@example.com").await;

    assert_eq!(response.status().as_u16(), 200);
    let json: TokenResponse = response.json().await.unwrap();
    assert!(json.token.is_some());
}

#[tokio::test]
async fn get_token_works_for_multiple_subscribers() {
    let app = spawn_app(function_name!()).await;

    let _ = mount_mock_email_server(&app.email_server, None).await;

    let subscriber1 = serde_json::json!({
        "name": "Subscriber One",
        "email": "subscriber1@example.com"
    });
    app.post_subscriptions(&subscriber1).await;

    let subscriber2 = serde_json::json!({
        "name": "Subscriber Two",
        "email": "subscriber2@example.com"
    });
    app.post_subscriptions(&subscriber2).await;

    let response1 = app.get_test_token("subscriber1@example.com").await;
    assert_eq!(response1.status().as_u16(), 200);
    let json1: TokenResponse = response1.json().await.unwrap();
    let token1 = json1.token.unwrap();

    let response2 = app.get_test_token("subscriber2@example.com").await;
    assert_eq!(response2.status().as_u16(), 200);
    let json2: TokenResponse = response2.json().await.unwrap();
    let token2 = json2.token.unwrap();

    assert_ne!(token1, token2);
}

#[tokio::test]
async fn get_token_url_encodes_email_parameter_correctly() {
    let app = spawn_app(function_name!()).await;

    let email_with_plus = "test+tag@example.com";
    let body = serde_json::json!({
        "name": "Test User",
        "email": email_with_plus
    });
    let _ = mount_mock_email_server(&app.email_server, None).await;
    app.post_subscriptions(&body).await;

    let response = app.get_test_token(email_with_plus).await;

    assert_eq!(response.status().as_u16(), 200);
    let json: TokenResponse = response.json().await.unwrap();
    assert!(json.token.is_some());
}
