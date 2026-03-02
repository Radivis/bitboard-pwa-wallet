use crate::telemetry::spawn_blocking_with_tracing;
use anyhow::Context;
use argon2::password_hash::SaltString;
use argon2::{Algorithm, Argon2, Params, PasswordHash, PasswordHasher, PasswordVerifier, Version};
use secrecy::{ExposeSecret, Secret};
use sqlx::PgPool;

#[derive(thiserror::Error, Debug)]
pub enum AuthError {
    #[error("Invalid credentials.")]
    InvalidCredentials(#[source] anyhow::Error),
    #[error(transparent)]
    UnexpectedError(#[from] anyhow::Error),
}

pub struct Credentials {
    pub username: String,
    pub password: Secret<String>,
}

#[tracing::instrument(name = "Validate credentials", skip(credentials, pool))]
pub async fn validate_credentials(
    credentials: Credentials,
    pool: &PgPool,
) -> Result<uuid::Uuid, AuthError> {
    let mut user_id = None;
    let mut expected_password_hash = Secret::new(
        "$argon2id$v=19$m=15000,t=2,p=1$\
        gZiV/M1gPc22ElAH/Jh1Hw$\
        CWOrkoo7oJBQ/iyh7uJ0LO2aLEfrHwTWllSAxT0zRno"
            .to_string(),
    );

    if let Some((stored_user_id, stored_password_hash)) =
        get_stored_credentials(&credentials.username, pool)
            .await
            .map_err(AuthError::UnexpectedError)?
    {
        user_id = Some(stored_user_id);
        expected_password_hash = stored_password_hash;
    }

    let verify_result = spawn_blocking_with_tracing(move || {
        verify_password_hash(expected_password_hash, credentials.password)
    })
    .await
    .context("Failed to spawn blocking task.")?;

    // Note: Password verification success/failure could be logged to an access.log
    // file together with the username for security auditing purposes

    verify_result?;

    // This is only set to `Some` if we found credentials in the store
    // So, even if the default password ends up matching (somehow)
    // with the provided password,
    // we never authenticate a non-existing user.
    user_id
        .ok_or_else(|| anyhow::anyhow!("Unknown username."))
        .map_err(AuthError::InvalidCredentials)
}

#[tracing::instrument(name = "Change password", skip(password, pool))]
pub async fn change_password(
    user_id: uuid::Uuid,
    password: Secret<String>,
    pool: &PgPool,
) -> Result<(), anyhow::Error> {
    let password_hash = spawn_blocking_with_tracing(move || compute_password_hash(password))
        .await?
        .context("Failed to hash password")?;
    sqlx::query!(
        r#"
        UPDATE users
        SET password_hash = $1
        WHERE user_id = $2
        "#,
        password_hash.expose_secret(),
        user_id
    )
    .execute(pool)
    .await
    .context("Failed to change user's password in the database.")?;
    Ok(())
}

#[tracing::instrument(name = "Get stored credentials", skip(username, pool))]
async fn get_stored_credentials(
    username: &str,
    pool: &PgPool,
) -> Result<Option<(uuid::Uuid, Secret<String>)>, anyhow::Error> {
    let row = sqlx::query!(
        r#"
        SELECT user_id, password_hash
        FROM users
        WHERE username = $1
        "#,
        username,
    )
    .fetch_optional(pool)
    .await
    .context("Failed to perform a query to retrieve stored credentials.")?
    .map(|row| (row.user_id, Secret::new(row.password_hash)));
    Ok(row)
}

#[tracing::instrument(name = "Check if users exist", skip(pool))]
pub async fn check_users_exist(pool: &PgPool) -> Result<bool, anyhow::Error> {
    let count = sqlx::query!(
        r#"
        SELECT COUNT(*) as count
        FROM users
        "#
    )
    .fetch_one(pool)
    .await
    .context("Failed to check if users exist.")?;
    Ok(count.count.unwrap_or(0) > 0)
}

#[tracing::instrument(name = "Create admin user", skip(password, pool))]
pub async fn create_admin_user(
    username: String,
    password: Secret<String>,
    pool: &PgPool,
) -> Result<uuid::Uuid, anyhow::Error> {
    let user_id = uuid::Uuid::new_v4();
    let password_hash = spawn_blocking_with_tracing(move || compute_password_hash(password))
        .await?
        .context("Failed to hash password")?;

    sqlx::query!(
        r#"
        INSERT INTO users (user_id, username, password_hash)
        VALUES ($1, $2, $3)
        "#,
        user_id,
        username,
        password_hash.expose_secret(),
    )
    .execute(pool)
    .await
    .context("Failed to create admin user in the database.")?;

    Ok(user_id)
}

/// Get Argon2 parameters appropriate for the current context
/// For E2E tests, use lighter parameters to avoid overwhelming the system
/// when many password operations run concurrently
fn get_argon2_params() -> Params {
    #[cfg(feature = "e2e-tests")]
    {
        // Lighter parameters for E2E tests to handle high concurrency
        // Memory: 8MB (vs 15MB), Time: 1 iteration (vs 2)
        // Still secure enough for testing, but ~2x faster
        Params::new(8000, 1, 1, None).unwrap()
    }
    #[cfg(not(feature = "e2e-tests"))]
    {
        // Production parameters: secure but slower
        // Memory: 15MB, Time: 2 iterations
        Params::new(15000, 2, 1, None).unwrap()
    }
}

fn compute_password_hash(password: Secret<String>) -> Result<Secret<String>, anyhow::Error> {
    let salt = SaltString::generate(&mut rand::thread_rng());
    let password_hash = Argon2::new(Algorithm::Argon2id, Version::V0x13, get_argon2_params())
        .hash_password(password.expose_secret().as_bytes(), &salt)?
        .to_string();
    Ok(Secret::new(password_hash))
}

#[tracing::instrument(
    name = "Verify password hash",
    skip(expected_password_hash, password_candidate)
)]
fn verify_password_hash(
    expected_password_hash: Secret<String>,
    password_candidate: Secret<String>,
) -> Result<(), AuthError> {
    let start = std::time::Instant::now();
    tracing::debug!(
        "Starting password verification (candidate length: {})",
        password_candidate.expose_secret().len()
    );

    let expected_password_hash = PasswordHash::new(expected_password_hash.expose_secret())
        .context("Failed to parse hash in PHC string format.")?;

    let result = Argon2::default()
        .verify_password(
            password_candidate.expose_secret().as_bytes(),
            &expected_password_hash,
        )
        .context("Invalid password.")
        .map_err(AuthError::InvalidCredentials);

    let duration = start.elapsed();
    tracing::debug!("Password verification completed in {:?}", duration);

    result
}
