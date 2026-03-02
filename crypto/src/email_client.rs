use crate::domain::SubscriberEmailAddress;
use reqwest::Client;
use secrecy::{ExposeSecret, Secret};

#[derive(Clone, Debug)]
pub struct EmailClient {
    base_url: String,
    http_client: Client,
    sender: SubscriberEmailAddress,
    authorization_token: Secret<String>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "PascalCase")]
struct SendEmailRequest<'a> {
    from: &'a str,
    to: &'a str,
    subject: &'a str,
    html_body: &'a str,
    text_body: &'a str,
}

#[derive(Debug)]
pub struct EmailData<'a> {
    pub recipient: &'a SubscriberEmailAddress,
    pub subject: &'a String,
    pub html_content: &'a String,
    pub text_content: &'a String,
}

impl EmailClient {
    pub fn new(
        base_url: String,
        sender: SubscriberEmailAddress,
        authorization_token: Secret<String>,
        timeout: std::time::Duration,
    ) -> Self {
        let http_client = Client::builder().timeout(timeout).build().unwrap();
        Self {
            http_client,
            base_url,
            sender,
            authorization_token,
        }
    }

    #[tracing::instrument(name = "Sending email")]
    pub async fn send_email<'a>(&self, data: EmailData<'a>) -> Result<(), reqwest::Error> {
        // No matter the input
        let url = format!("{}/email", self.base_url);
        let request_body = SendEmailRequest {
            from: self.sender.as_ref(),
            to: data.recipient.as_ref(),
            subject: data.subject,
            html_body: data.html_content,
            text_body: data.text_content,
        };
        let _builder = self
            .http_client
            .post(&url)
            .header(
                "X-Postmark-Server-Token",
                self.authorization_token.expose_secret(),
            )
            .json(&request_body)
            .send()
            .await?
            .error_for_status()
            .map_err(|e| {
                tracing::error!("Failed to send email: {:?}", e);
                e
            })?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use crate::domain::SubscriberEmailAddress;
    use crate::email_client::{EmailClient, EmailData};
    use claims::{assert_err, assert_ok};
    use fake::faker::internet::en::SafeEmail;
    use fake::faker::lorem::en::{Paragraph, Sentence};
    use fake::{Fake, Faker};
    use secrecy::Secret;
    use wiremock::matchers::{any, header, header_exists, method, path};
    use wiremock::{Mock, MockServer, Request, ResponseTemplate};

    struct SendEmailBodyMatcher;
    impl wiremock::Match for SendEmailBodyMatcher {
        fn matches(&self, request: &Request) -> bool {
            // Try to parse the body as a JSON value
            let result: Result<serde_json::Value, _> = serde_json::from_slice(&request.body);
            if let Ok(body) = result {
                dbg!(&body);
                // Check that all the mandatory fields are populated
                // without inspecting the field values
                body.get("From").is_some()
                    && body.get("To").is_some()
                    && body.get("Subject").is_some()
                    && body.get("HtmlBody").is_some()
                    && body.get("TextBody").is_some()
            } else {
                // If parsing failed, do not match the request
                false
            }
        }
    }

    fn generate_random_email_subject() -> String {
        Sentence(1..2).fake()
    }

    fn generate_random_email_content() -> String {
        Paragraph(1..10).fake()
    }

    fn generate_random_subscriber_email_address() -> SubscriberEmailAddress {
        SubscriberEmailAddress::parse(SafeEmail().fake()).unwrap()
    }

    fn get_email_client_test_instance(base_url: &str) -> EmailClient {
        EmailClient::new(
            base_url.into(),
            generate_random_subscriber_email_address(),
            Secret::new(Faker.fake()),
            std::time::Duration::from_millis(200),
        )
    }

    async fn send_random_email(email_client: &EmailClient) -> Result<(), reqwest::Error> {
        let content = &generate_random_email_content();
        email_client
            .send_email(EmailData {
                recipient: &generate_random_subscriber_email_address(),
                subject: &generate_random_email_subject(),
                html_content: content,
                text_content: content,
            })
            .await
    }

    #[tokio::test]
    async fn send_email_sends_the_expected_request() {
        // Arrange
        let mock_server = MockServer::start().await;
        tracing::debug!("mock server started with url {}", &(mock_server.uri()));
        let email_client = get_email_client_test_instance(&mock_server.uri());
        Mock::given(header_exists("X-Postmark-Server-Token"))
            .and(header("Content-Type", "application/json"))
            .and(path("/email"))
            .and(method("POST"))
            // Use our custom matcher!
            .and(SendEmailBodyMatcher)
            .respond_with(ResponseTemplate::new(200))
            .expect(1)
            .mount(&mock_server)
            .await;
        // Act
        let _ = send_random_email(&email_client).await;
        // Assert
        // Mock expectations are checked on drop
    }

    // New happy-path test!
    #[tokio::test]
    async fn send_email_succeeds_if_the_server_returns_200() {
        // Arrange
        let mock_server = MockServer::start().await;
        tracing::debug!("mock server started with url {}", mock_server.uri());
        let email_client = get_email_client_test_instance(&mock_server.uri());
        // We do not copy in all the matchers we have in the other test.
        // The purpose of this test is not to assert on the request we
        // are sending out!
        // We add the bare minimum needed to trigger the path we want
        // to test in `send_email`.
        Mock::given(any())
            .respond_with(ResponseTemplate::new(200))
            .expect(1)
            .mount(&mock_server)
            .await;
        // Act
        let outcome = send_random_email(&email_client).await;
        // Assert
        assert_ok!(outcome);
    }

    #[tokio::test]
    async fn send_email_fails_if_the_server_returns_500() {
        // Arrange
        let mock_server = MockServer::start().await;
        tracing::debug!("mock server started with url {}", mock_server.uri());
        let email_client = get_email_client_test_instance(&mock_server.uri());
        Mock::given(any())
            // Not a 200 anymore!
            .respond_with(ResponseTemplate::new(500))
            .expect(1)
            .mount(&mock_server)
            .await;
        // Act
        let outcome = send_random_email(&email_client).await;
        // Assert
        assert_err!(outcome);
    }

    #[tokio::test]
    async fn send_email_times_out_if_the_server_takes_too_long() {
        // Arrange
        let mock_server = MockServer::start().await;
        tracing::debug!("mock server started with url {}", mock_server.uri());
        let email_client = get_email_client_test_instance(&mock_server.uri());
        let response = ResponseTemplate::new(200)
            // 3 minutes!
            .set_delay(std::time::Duration::from_secs(180));
        Mock::given(any())
            .respond_with(response)
            .expect(1)
            .mount(&mock_server)
            .await;
        // Act
        let outcome = send_random_email(&email_client).await;
        // Assert
        assert_err!(outcome);
    }
}
