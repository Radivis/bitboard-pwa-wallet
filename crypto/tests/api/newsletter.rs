use crate::common::function_name;
use crate::common::{
    ConfirmationLinks, assert_is_json_error, assert_json_response,
    assert_subscription_confirm_redirect, mount_mock_email_server,
};
use crate::common::{TestApp, spawn_app, spawn_app_container_with_user};
use fake::Fake;
use fake::faker::internet::en::SafeEmail;
use fake::faker::name::en::Name;
use std::time::Duration;
use wiremock::matchers::{method, path};
use wiremock::{Mock, MockBuilder, ResponseTemplate, Times};

// Shorthand for a common mocking setup
fn when_sending_an_email() -> MockBuilder {
    Mock::given(path("/email")).and(method("POST"))
}

const NEWSLETTER_CONFIRMATION_MESSAGE: &str =
    "The newsletter issue has been accepted - emails will go out shortly.";

fn default_newsletter_request_body() -> serde_json::Value {
    serde_json::json!({
        "title": "Newsletter title",
        "text_content": "Newsletter body as plain text",
        "html_content": "<p>Newsletter body as HTML</p>",
        "idempotency_key": uuid::Uuid::new_v4().to_string()
    })
}

fn newsletter_request_body_with_idempotency_key(idempotency_key: &str) -> serde_json::Value {
    serde_json::json!({
        "title": "Newsletter title",
        "text_content": "Newsletter body as plain text",
        "html_content": "<p>Newsletter body as HTML</p>",
        "idempotency_key": idempotency_key
    })
}

#[tokio::test]
async fn newsletters_are_not_delivered_to_unconfirmed_subscribers() {
    // Arrange
    let container = spawn_app_container_with_user(function_name!())
        .await
        .login()
        .await;
    create_unconfirmed_subscriber(&container.app).await;

    // No request is supposed to hit our email server mirroring no newsletter being sent!
    let times: Times = 0.into();
    let _ = mount_mock_email_server(&container.app.email_server, Some(times)).await;

    // Act
    // Use the fact that there are no confirmed subscribers at all at this stage!
    let response = container
        .app
        .post_newsletters(&default_newsletter_request_body())
        .await;

    // Assert - Should return 200 JSON success
    assert_eq!(response.status().as_u16(), 200);
    let success_body: serde_json::Value = assert_json_response(response).await;
    assert!(success_body["success"].as_bool().unwrap());
    assert_eq!(
        success_body["message"].as_str().unwrap(),
        NEWSLETTER_CONFIRMATION_MESSAGE
    );

    container.app.dispatch_all_pending_emails().await;

    // Mock verifies on Drop that we haven't sent the newsletter email
}

#[tokio::test]
async fn newsletters_are_delivered_to_confirmed_subscribers() {
    // Arrange
    let container = spawn_app_container_with_user(function_name!())
        .await
        .login()
        .await;
    create_confirmed_subscriber(&container.app).await;
    let times: Times = 1.into();
    let _ = mount_mock_email_server(&container.app.email_server, Some(times)).await;

    // Act
    let response = container
        .app
        .post_newsletters(&default_newsletter_request_body())
        .await;

    // Assert - Should return 200 JSON success
    assert_eq!(response.status().as_u16(), 200);
    let success_body: serde_json::Value = assert_json_response(response).await;
    assert!(success_body["success"].as_bool().unwrap());
    assert_eq!(
        success_body["message"].as_str().unwrap(),
        NEWSLETTER_CONFIRMATION_MESSAGE
    );

    container.app.dispatch_all_pending_emails().await;
    // Mock verifies on Drop that we have sent the newsletter email
}

#[tokio::test]
async fn newsletters_returns_400_for_invalid_data() {
    // Arrange
    let container = spawn_app_container_with_user(function_name!())
        .await
        .login()
        .await;
    let test_cases = vec![
        (
            serde_json::json!({
                "text_content": "Newsletter body as plain text" ,
                "html_content": "<p>Newsletter body as HTML</p>",
            }),
            "missing title",
        ),
        (
            serde_json::json!({"title": "Newsletter!"}),
            "missing content",
        ),
    ];

    // Act
    for (invalid_body, error_message) in test_cases {
        let response = container.app.post_newsletters(&invalid_body).await;

        // Assert
        assert_eq!(
            422,
            response.status().as_u16(),
            "The API did not fail with 422 Unprocessable Entity when the payload was {}.",
            error_message
        );
    }
}

#[tokio::test]
async fn you_must_be_logged_in_to_send_newsletters_form() {
    // Arrange
    let app = spawn_app(function_name!()).await;

    // Act - Try to access newsletter endpoint without auth
    let response = app
        .api_client
        .post(format!("{}/api/admin/newsletters", &app.address))
        .json(&serde_json::json!({
            "title": "Test-Title",
            "html_content": "<i>This is content!</i>",
            "text_content": "This is content!",
            "idempotency_key": uuid::Uuid::new_v4().to_string()
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
async fn you_must_be_logged_in_to_send_newsletters() {
    // Arrange
    let container = spawn_app_container_with_user(function_name!()).await;

    // Act
    let response = container
        .app
        .post_newsletters(&serde_json::json!({
            "title": "Test-Title",
            "html_content": "<i>This is content!</i>",
            "text_content": "This is content!",
            "idempotency_key": uuid::Uuid::new_v4().to_string()
        }))
        .await;
    // Assert - Should return 401 JSON error
    assert_is_json_error(&response, 401);
    let error_body: serde_json::Value = assert_json_response(response).await;
    assert!(!error_body["success"].as_bool().unwrap());
}

#[tokio::test]
async fn newsletter_creation_is_idempotent() {
    // Arrange
    let container = spawn_app_container_with_user(function_name!())
        .await
        .login()
        .await;
    create_confirmed_subscriber(&container.app).await;

    let times: Times = 1.into();
    let _ = mount_mock_email_server(&container.app.email_server, Some(times)).await;

    // Act - Part 1 - Submit newsletter form
    let newsletter_request_body = default_newsletter_request_body();
    let response = container
        .app
        .post_newsletters(&newsletter_request_body)
        .await;
    assert_eq!(response.status().as_u16(), 200);
    let success_body: serde_json::Value = assert_json_response(response).await;
    assert!(success_body["success"].as_bool().unwrap());
    assert_eq!(
        success_body["message"].as_str().unwrap(),
        NEWSLETTER_CONFIRMATION_MESSAGE
    );

    // Act - Part 2 - Submit newsletter form **again** (idempotent)
    let response = container
        .app
        .post_newsletters(&newsletter_request_body)
        .await;
    assert_eq!(response.status().as_u16(), 200);
    let success_body2: serde_json::Value = assert_json_response(response).await;
    assert!(success_body2["success"].as_bool().unwrap());
    assert_eq!(
        success_body2["message"].as_str().unwrap(),
        NEWSLETTER_CONFIRMATION_MESSAGE
    );

    container.app.dispatch_all_pending_emails().await;
    // Mock verifies on Drop that we have sent the newsletter email **once**
}

#[tokio::test]
async fn concurrent_form_submission_is_handled_gracefully() {
    // Arrange
    let container = spawn_app_container_with_user(function_name!())
        .await
        .login()
        .await;
    create_confirmed_subscriber(&container.app).await;

    when_sending_an_email()
        // Setting a long delay to ensure that the second request
        // arrives before the first one completes
        .respond_with(ResponseTemplate::new(200).set_delay(Duration::from_secs(2)))
        .expect(1)
        .mount(&container.app.email_server)
        .await;

    // Act - Submit two newsletter forms concurrently
    let newsletter_request_body = default_newsletter_request_body();
    let response1 = container.app.post_newsletters(&newsletter_request_body);
    let response2 = container.app.post_newsletters(&newsletter_request_body);
    let (response1, response2) = tokio::join!(response1, response2);
    assert_eq!(response1.status(), response2.status());
    assert_eq!(response1.status().as_u16(), 200);
    let body1: serde_json::Value = assert_json_response(response1).await;
    let body2: serde_json::Value = assert_json_response(response2).await;
    assert_eq!(body1["success"], body2["success"]);
    assert_eq!(body1["message"], body2["message"]);

    container.app.dispatch_all_pending_emails().await;
    // Mock verifies on Drop that we have sent the newsletter email **once**
}

#[tokio::test]
async fn newsletter_are_sent_again_after_idempotency_key_expiry() {
    // Arrange
    let container = spawn_app_container_with_user(function_name!())
        .await
        .login()
        .await;
    create_confirmed_subscriber(&container.app).await;

    let times: Times = 2.into();
    let _ = mount_mock_email_server(&container.app.email_server, Some(times)).await;

    // Act - Submit two newsletter forms with a time difference > 24 h
    let idempotency_key = uuid::Uuid::new_v4().to_string();
    let newsletter_request_body = newsletter_request_body_with_idempotency_key(&idempotency_key);
    let response1 = container
        .app
        .post_newsletters(&newsletter_request_body)
        .await;
    let status1 = response1.status();
    assert_eq!(status1.as_u16(), 200);
    let body1: serde_json::Value = assert_json_response(response1).await;
    assert!(body1["success"].as_bool().unwrap());

    let expired_timestamp = chrono::Utc::now() - chrono::Duration::hours(25);
    let user_id = container.test_user.user_id;
    let idempotency_key_ref: &str = idempotency_key.as_ref();

    tracing::debug!(
        "Updating idempotency key {} for user {} to timestamp {}",
        idempotency_key_ref,
        user_id,
        expired_timestamp
    );

    let keys = sqlx::query!(
        r#"
        SELECT user_id, idempotency_key, created_at
        FROM idempotency
        "#
    )
    .fetch_all(&container.app.db_connection_pool)
    .await
    .expect("Failed to fetch idempotency");

    for key in keys {
        tracing::debug!("Idempotency key record: {:?}", key);
    }

    let result = sqlx::query!(
        r#"
        UPDATE idempotency
        SET
            created_at = $1
        WHERE
            user_id = $2 AND
            idempotency_key = $3
        "#,
        expired_timestamp,
        user_id,
        idempotency_key_ref,
    )
    .execute(&container.app.db_connection_pool)
    .await
    .expect("Failed to update idempotency");

    if result.rows_affected() == 0 {
        panic!("Idempotency update failed!");
    }

    let response2 = container
        .app
        .post_newsletters(&newsletter_request_body)
        .await;

    assert_eq!(status1, response2.status());
    assert_eq!(response2.status().as_u16(), 200);
    let body2: serde_json::Value = assert_json_response(response2).await;
    assert_eq!(body1["success"], body2["success"]);
    assert_eq!(body1["message"], body2["message"]);

    container.app.dispatch_all_pending_emails().await;
    // Mock verifies on Drop that we have sent the newsletter email **twice**
}

/// Use the public API of the application under test to create
/// an unconfirmed subscriber.
async fn create_unconfirmed_subscriber(app: &TestApp) -> ConfirmationLinks {
    let name: String = Name().fake();
    let email: String = SafeEmail().fake();
    let body = serde_json::json!({
        "name": name,
        "email": email
    });

    // One confirmation mail should be sent
    let _mock_guard = when_sending_an_email()
        .respond_with(ResponseTemplate::new(200))
        .named("Create unconfirmed subscriber")
        .expect(1)
        .mount_as_scoped(&app.email_server)
        .await;
    app.post_subscriptions(&body)
        .await
        .error_for_status()
        .unwrap();

    // We now inspect the requests received by the mock Postmark server
    // to retrieve the confirmation link and return it
    let confirmation_email_request = &app
        .email_server
        .received_requests()
        .await
        .unwrap()
        .pop()
        .unwrap();
    app.get_confirmation_links(confirmation_email_request)
}

async fn create_confirmed_subscriber(app: &TestApp) {
    // We can then reuse the same helper and just add
    // an extra step to actually call the confirmation link!
    let confirmation_link = create_unconfirmed_subscriber(app).await;
    // Use api_client which does not follow redirects (backend redirects to /subscribed)
    let response = app
        .api_client
        .get(confirmation_link.html.as_str())
        .send()
        .await
        .unwrap();
    assert_subscription_confirm_redirect(&response);
}

#[tokio::test]
async fn newsletter_contains_unsubscribe_link() {
    // Arrange
    let container = spawn_app_container_with_user(function_name!())
        .await
        .login()
        .await;
    create_confirmed_subscriber(&container.app).await;

    // Mount a fresh mock for the newsletter email (after confirmation email)
    when_sending_an_email()
        .respond_with(ResponseTemplate::new(200))
        .expect(1)
        .mount(&container.app.email_server)
        .await;

    // Act - Send newsletter
    let response = container
        .app
        .post_newsletters(&default_newsletter_request_body())
        .await;

    assert_eq!(response.status().as_u16(), 200);

    // Dispatch the emails
    container.app.dispatch_all_pending_emails().await;

    // Assert - Check that the email contains unsubscribe link
    let email_requests = container
        .app
        .email_server
        .received_requests()
        .await
        .unwrap();

    // The last email should be the newsletter (previous ones are confirmation emails)
    let newsletter_request = email_requests.last().unwrap();
    let body: serde_json::Value = serde_json::from_slice(&newsletter_request.body).unwrap();

    let html_body = body["HtmlBody"].as_str().unwrap();
    let text_body = body["TextBody"].as_str().unwrap();

    // Verify HTML contains unsubscribe link (without /api prefix for frontend SPA)
    assert!(
        html_body.contains("/subscriptions/unsubscribe?subscription_token="),
        "HTML body should contain unsubscribe link: {}",
        html_body
    );
    assert!(
        html_body.contains("To unsubscribe"),
        "HTML body should contain unsubscribe text"
    );

    // Verify plain text contains unsubscribe link (without /api prefix for frontend SPA)
    assert!(
        text_body.contains("/subscriptions/unsubscribe?subscription_token="),
        "Text body should contain unsubscribe link: {}",
        text_body
    );
    assert!(
        text_body.contains("To unsubscribe"),
        "Text body should contain unsubscribe text"
    );
}
