use crate::common::create_confirmed_subscriber_with_token;
use crate::common::function_name;
use crate::common::spawn_app;
use crate::common::{
    MALFORMED_TOKEN, NONEXISTENT_UUID_TOKEN, TEST_SUBSCRIBER_EMAIL, TEST_SUBSCRIBER_NAME,
};

#[tokio::test]
async fn unsubscribe_without_token_returns_400() {
    // Arrange
    let app = spawn_app(function_name!()).await;

    // Act - Test GET endpoint
    let get_response = reqwest::get(&format!("{}/api/subscriptions/unsubscribe", app.address))
        .await
        .unwrap();

    // Assert GET
    assert_eq!(get_response.status().as_u16(), 400);

    // Act - Test POST endpoint
    let post_response = app
        .api_client
        .post(format!("{}/api/subscriptions/unsubscribe", app.address))
        .send()
        .await
        .unwrap();

    // Assert POST
    assert_eq!(post_response.status().as_u16(), 400);
}

#[tokio::test]
async fn unsubscribe_with_malformed_token_returns_400() {
    // Arrange
    let app = spawn_app(function_name!()).await;

    // Act - Test GET endpoint
    let get_response = app.get_unsubscribe_info(MALFORMED_TOKEN).await;

    // Assert GET
    assert_eq!(get_response.status().as_u16(), 400);

    // Act - Test POST endpoint
    let post_response = app.post_unsubscribe(MALFORMED_TOKEN).await;

    // Assert POST
    assert_eq!(post_response.status().as_u16(), 400);
}

#[tokio::test]
async fn unsubscribe_with_nonexistent_token_returns_401() {
    // Arrange
    let app = spawn_app(function_name!()).await;

    // Act - Test GET endpoint
    let get_response = app.get_unsubscribe_info(NONEXISTENT_UUID_TOKEN).await;

    // Assert GET - Valid format but nonexistent token should return 401
    assert_eq!(get_response.status().as_u16(), 401);

    // Act - Test POST endpoint
    let post_response = app.post_unsubscribe(NONEXISTENT_UUID_TOKEN).await;

    // Assert POST - Valid format but nonexistent token should return 401
    assert_eq!(post_response.status().as_u16(), 401);
}

#[tokio::test]
async fn unsubscribe_removes_subscriber_from_database() {
    // Arrange
    let app = spawn_app(function_name!()).await;
    let token =
        create_confirmed_subscriber_with_token(&app, TEST_SUBSCRIBER_NAME, TEST_SUBSCRIBER_EMAIL)
            .await;

    // Verify subscriber exists
    let saved = sqlx::query!(
        "SELECT email, status FROM subscriptions WHERE email = $1",
        TEST_SUBSCRIBER_EMAIL
    )
    .fetch_one(&app.db_connection_pool)
    .await
    .expect("Failed to fetch subscriber");
    assert_eq!(saved.status, "confirmed");

    // Act - GET to verify email first
    let get_response = app.get_unsubscribe_info(&token).await;

    // Assert GET returns email
    assert_eq!(get_response.status().as_u16(), 200);
    let json_body: serde_json::Value = get_response.json().await.unwrap();
    assert_eq!(json_body["email"], TEST_SUBSCRIBER_EMAIL);

    // Act - POST to confirm unsubscribe
    let post_response = app.post_unsubscribe(&token).await;

    // Assert POST succeeds
    assert_eq!(post_response.status().as_u16(), 200);

    // Verify subscriber was removed from database
    let result = sqlx::query!(
        "SELECT email FROM subscriptions WHERE email = $1",
        TEST_SUBSCRIBER_EMAIL
    )
    .fetch_optional(&app.db_connection_pool)
    .await
    .expect("Failed to query database");

    assert!(
        result.is_none(),
        "Subscriber should have been deleted from database"
    );
}

#[tokio::test]
async fn unsubscribe_removes_subscription_token() {
    // Arrange
    let app = spawn_app(function_name!()).await;
    let token =
        create_confirmed_subscriber_with_token(&app, TEST_SUBSCRIBER_NAME, TEST_SUBSCRIBER_EMAIL)
            .await;

    // Verify token exists before unsubscribe
    let token_exists = sqlx::query!(
        "SELECT subscription_token FROM subscription_tokens WHERE subscription_token = $1",
        token
    )
    .fetch_optional(&app.db_connection_pool)
    .await
    .expect("Failed to query database");
    assert!(
        token_exists.is_some(),
        "Token should exist before unsubscribe"
    );

    // Act - GET first (doesn't delete)
    let get_response = app.get_unsubscribe_info(&token).await;
    assert_eq!(get_response.status().as_u16(), 200);

    // Verify token still exists after GET
    let token_still_exists = sqlx::query!(
        "SELECT subscription_token FROM subscription_tokens WHERE subscription_token = $1",
        token
    )
    .fetch_optional(&app.db_connection_pool)
    .await
    .expect("Failed to query database");
    assert!(
        token_still_exists.is_some(),
        "Token should still exist after GET"
    );

    // Act - POST to confirm unsubscribe
    let post_response = app.post_unsubscribe(&token).await;

    // Assert
    assert_eq!(post_response.status().as_u16(), 200);

    // Verify token was removed (via CASCADE)
    let token_result = sqlx::query!(
        "SELECT subscription_token FROM subscription_tokens WHERE subscription_token = $1",
        token
    )
    .fetch_optional(&app.db_connection_pool)
    .await
    .expect("Failed to query database");

    assert!(
        token_result.is_none(),
        "Token should have been deleted via CASCADE"
    );
}

#[tokio::test]
async fn confirm_fails_after_unsubscribe() {
    // Arrange - create confirmed subscriber, then unsubscribe
    let app = spawn_app(function_name!()).await;
    let token =
        create_confirmed_subscriber_with_token(&app, TEST_SUBSCRIBER_NAME, TEST_SUBSCRIBER_EMAIL)
            .await;

    // Act - First GET should succeed (token valid before unsubscribe)
    let get_response1 = app.get_unsubscribe_info(&token).await;
    assert_eq!(get_response1.status().as_u16(), 200);

    // Act - POST unsubscribe
    let unsubscribe_response = app.post_unsubscribe(&token).await;
    assert_eq!(unsubscribe_response.status().as_u16(), 200);

    // Act - Second GET should fail (token deleted after POST)
    let get_response2 = app.get_unsubscribe_info(&token).await;
    assert_eq!(get_response2.status().as_u16(), 401);

    // Act - Try to confirm after unsubscribing (token no longer exists)
    let confirm_response = reqwest::get(&format!(
        "{}/api/subscriptions/confirm?subscription_token={}",
        app.address, token
    ))
    .await
    .unwrap();

    // Assert - Confirm should fail with 401
    assert_eq!(confirm_response.status().as_u16(), 401);
    let error_text = confirm_response.text().await.unwrap();
    assert!(error_text.contains("Invalid or expired subscription token"));
}
