//! Common constants used across route handlers

/// Generic error message for internal server errors
pub const ERROR_SOMETHING_WENT_WRONG: &str = "Something went wrong";

/// Error message for authentication failures
pub const ERROR_AUTHENTICATION_FAILED: &str = "Authentication failed";

/// Error message for missing authentication
pub const ERROR_AUTHENTICATION_REQUIRED: &str = "Authentication required";

/// Subscription status: awaiting email confirmation
pub const SUBSCRIPTION_STATUS_PENDING_CONFIRMATION: &str = "pending_confirmation";

/// Subscription status: email confirmed, receiving newsletters
pub const SUBSCRIPTION_STATUS_CONFIRMED: &str = "confirmed";

/// Builds the subscription confirmation URL for email links
pub fn subscription_confirm_url(base_url: &str, subscription_token: &str) -> String {
    format!(
        "{}/subscriptions/confirm?subscription_token={}",
        base_url, subscription_token
    )
}

/// Frontend path to redirect to after successful subscription confirmation
pub const SUBSCRIPTION_CONFIRMED_REDIRECT_PATH: &str = "/subscribed";

/// Builds the unsubscribe URL for newsletter email footers
pub fn unsubscribe_url(base_url: &str, subscription_token: &str) -> String {
    format!(
        "{}/subscriptions/unsubscribe?subscription_token={}",
        base_url, subscription_token
    )
}
