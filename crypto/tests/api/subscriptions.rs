use crate::common::function_name;
use crate::common::spawn_app;
use crate::common::{mount_mock_email_server, retry};
use wiremock::Times;

#[tokio::test]
#[tracing::instrument(name = "subscribe_returns_a_200_for_valid_form_data")]
async fn subscribe_returns_a_200_for_valid_form_data() {
    // Arrange
    let test_app = spawn_app(function_name!()).await;
    tracing::debug!(
        "test_app started with email_server: {:?}",
        &test_app.email_server
    );

    mount_mock_email_server(&test_app.email_server, None).await;

    // Act
    let body = serde_json::json!({
        "name": "le guin",
        "email": "ursula_le_guin@gmail.com"
    });
    let response = test_app.post_subscriptions(&body).await;

    // Assert
    assert_eq!(200, response.status().as_u16());
}

#[tokio::test]
#[tracing::instrument(name = "subscribe_persists_the_new_subscriber")]
async fn subscribe_persists_the_new_subscriber() {
    // Arrange
    let test_app = spawn_app(function_name!()).await;
    tracing::debug!(
        "test_app started with email_server: {:?}",
        &test_app.email_server
    );

    let times: Times = (0..).into();
    let _ = mount_mock_email_server(&test_app.email_server, Some(times)).await;

    // Act
    let body = serde_json::json!({
        "name": "le guin",
        "email": "ursula_le_guin@gmail.com"
    });
    test_app.post_subscriptions(&body).await;

    // Assert
    let saved = retry(
        || async {
            sqlx::query!("SELECT email, name, status FROM subscriptions",)
                .fetch_one(&test_app.db_connection_pool)
                .await
        },
        5,
    )
    .await;

    assert_eq!(saved.email, "ursula_le_guin@gmail.com");
    assert_eq!(saved.name, "le guin");
    assert_eq!(saved.status, "pending_confirmation");
}

#[tokio::test]
#[tracing::instrument(name = "subscribe_returns_a_400_when_data_is_missing")]
async fn subscribe_returns_a_400_when_data_is_missing() {
    // Arrange
    let test_app = spawn_app(function_name!()).await;
    tracing::debug!(
        "test_app started with email_server: {:?}",
        &test_app.email_server
    );
    let test_cases = vec![
        (serde_json::json!({"name": "le guin"}), "missing the email"),
        (
            serde_json::json!({"email": "ursula_le_guin@gmail.com"}),
            "missing the name",
        ),
        (serde_json::json!({}), "missing both name and email"),
    ];
    for (invalid_body, error_message) in test_cases {
        // Act
        let response = test_app.post_subscriptions(&invalid_body).await;

        // Assert
        assert_eq!(
            422,
            response.status().as_u16(),
            // Additional customised error message on test failure
            "The API did not fail with 422 Unprocessable Entity when the payload was {}.",
            error_message
        );
    }
}

#[tokio::test]
#[tracing::instrument(name = "subscribe_returns_a_400_when_fields_are_present_but_invalid")]
async fn subscribe_returns_a_400_when_fields_are_present_but_invalid() {
    // Arrange
    let test_app = spawn_app(function_name!()).await;
    tracing::debug!(
        "test_app started with email_server: {:?}",
        &test_app.email_server
    );
    let test_cases = vec![
        (
            serde_json::json!({"name": "", "email": "ursula_le_guin@gmail.com"}),
            "empty name",
        ),
        (
            serde_json::json!({"name": "Ursula", "email": ""}),
            "empty email",
        ),
        (
            serde_json::json!({"name": "Ursula", "email": "definitely-not-an-email"}),
            "invalid email",
        ),
    ];
    for (invalid_body, error_message) in test_cases {
        // Act
        let response = test_app.post_subscriptions(&invalid_body).await;

        // Assert
        assert_eq!(
            400,
            response.status().as_u16(),
            // Additional customised error message on test failure
            "The API did not return a 400 Bad Request when the payload was {}.",
            error_message
        );
    }
}

#[tokio::test]
#[tracing::instrument(name = "subscribe_sends_a_confirmation_email_for_valid_data")]
async fn subscribe_sends_a_confirmation_email_for_valid_data() {
    // Arrange
    let test_app = spawn_app(function_name!()).await;
    tracing::debug!(
        "test_app started with email_server: {:?}",
        &test_app.email_server
    );
    let body = serde_json::json!({
        "name": "le guin",
        "email": "ursula_le_guin@gmail.com"
    });
    let times: Times = (1..).into();
    let _ = mount_mock_email_server(&test_app.email_server, Some(times)).await;
    // Act
    test_app.post_subscriptions(&body).await;
    // Assert
    // Mock
}

#[tokio::test]
#[tracing::instrument(name = "subscribe_sends_a_confirmation_email_with_a_link")]
async fn subscribe_sends_a_confirmation_email_with_a_link() {
    // Arrange
    let test_app = spawn_app(function_name!()).await;
    tracing::debug!(
        "test_app started with email_server: {:?}",
        &test_app.email_server
    );
    let body = serde_json::json!({
        "name": "le guin",
        "email": "ursula_le_guin@gmail.com"
    });
    let _ = mount_mock_email_server(&test_app.email_server, None).await;

    // Act
    test_app.post_subscriptions(&body).await;

    // Assert
    // Get the first intercepted request
    let email_request = &test_app.email_server.received_requests().await.unwrap()[0];
    let confirmation_links = test_app.get_confirmation_links(email_request);
    // The two links should be identical
    assert_eq!(confirmation_links.html, confirmation_links.plain_text);
}

#[tokio::test]
#[tracing::instrument(name = "subscribe_sends_two_confirmation_emails_when_subscribing_twice")]
async fn subscribe_sends_two_confirmation_emails_when_subscribing_twice() {
    // Arrange
    let test_app = spawn_app(function_name!()).await;
    tracing::debug!(
        "test_app started with email_server: {:?}",
        &test_app.email_server
    );
    let body = serde_json::json!({
        "name": "le guin",
        "email": "ursula_le_guin@gmail.com"
    });
    // Don't expect the number of requests here. This is checked in the assertion below.
    let _ = mount_mock_email_server(&test_app.email_server, None).await;

    // Act
    test_app.post_subscriptions(&body).await;
    test_app.post_subscriptions(&body).await;

    // Assert
    // Get all intercepted requests
    let email_requests = test_app.email_server.received_requests().await.unwrap();
    assert_eq!(
        email_requests.len(),
        2,
        "Expected 2 email requests, got {}",
        email_requests.len()
    );
    // The two links should be identical
    let confirmation_links1 = test_app.get_confirmation_links(&email_requests[0]);
    let confirmation_links2 = test_app.get_confirmation_links(&email_requests[1]);
    assert_eq!(confirmation_links1.html, confirmation_links2.html);
    assert_eq!(
        confirmation_links1.plain_text,
        confirmation_links2.plain_text
    );
}

#[tokio::test]
async fn subscribe_fails_if_there_is_a_fatal_database_error() {
    // Arrange
    let app = spawn_app(function_name!()).await;
    let body = serde_json::json!({
        "name": "le guin",
        "email": "ursula_le_guin@gmail.com"
    });
    // Sabotage the database by trying to drop a cloumn that doesn't exist!
    sqlx::query!("ALTER TABLE subscription_tokens DROP COLUMN subscription_token;",)
        .execute(&app.db_connection_pool)
        .await
        .unwrap();
    // Act
    let response = app.post_subscriptions(&body).await;

    // Assert
    assert_eq!(response.status().as_u16(), 500);
}
