use super::IdempotencyKey;
use axum::http::{HeaderMap, HeaderValue, StatusCode};
use axum::response::{IntoResponse, Response};
use chrono::{Duration, Utc};
use http_body_util::BodyExt;
use sqlx::{Executor, PgPool};
use sqlx::{Postgres, Transaction};
use uuid::Uuid;

#[derive(Debug, sqlx::Type)]
#[sqlx(type_name = "header_pair")]
struct HeaderPairRecord {
    name: String,
    value: Vec<u8>,
}

#[allow(clippy::large_enum_variant)]
pub enum NextAction {
    StartProcessing(Transaction<'static, Postgres>),
    ReturnSavedResponse(Response),
}

async fn delete_saved_response(
    pool: &PgPool,
    idempotency_key: &IdempotencyKey,
    user_id: Uuid,
) -> Result<(), anyhow::Error> {
    let query_result = sqlx::query!(
        r#"
        DELETE FROM idempotency
        WHERE
        user_id = $1 AND
        idempotency_key = $2
        "#,
        user_id,
        idempotency_key.as_ref()
    )
    .execute(pool)
    .await?;
    if query_result.rows_affected() == 0 {
        Err(anyhow::anyhow!("Could not delete saved response!"))
    } else {
        Ok(())
    }
}

pub async fn get_saved_response(
    pool: &PgPool,
    idempotency_key: &IdempotencyKey,
    user_id: Uuid,
) -> Result<Option<Response>, anyhow::Error> {
    let saved_response = sqlx::query!(
        r#"
        SELECT
            created_at,
            response_status_code as "response_status_code!",
            response_headers as "response_headers!: Vec<HeaderPairRecord>",
            response_body as "response_body!"
        FROM idempotency
        WHERE
        user_id = $1 AND
        idempotency_key = $2
        "#,
        user_id,
        idempotency_key.as_ref()
    )
    .fetch_optional(pool)
    .await?;
    if let Some(r) = saved_response {
        let now = Utc::now();
        if r.created_at < now - Duration::hours(24) {
            tracing::info!("Idempotency key expired - deleting idempotency record");
            delete_saved_response(pool, idempotency_key, user_id).await?;
            return Ok(Some((StatusCode::REQUEST_TIMEOUT, "").into_response()));
        }
        let status_code = StatusCode::from_u16(r.response_status_code.try_into()?)?;
        let mut headers = HeaderMap::new();
        for HeaderPairRecord { name, value } in r.response_headers {
            if let (Ok(name), Ok(value)) = (
                name.parse::<axum::http::HeaderName>(),
                HeaderValue::from_bytes(&value),
            ) {
                headers.insert(name, value);
            }
        }
        Ok(Some(
            (status_code, headers, r.response_body).into_response(),
        ))
    } else {
        Ok(None)
    }
}

pub async fn try_processing(
    pool: &PgPool,
    idempotency_key: &IdempotencyKey,
    user_id: Uuid,
) -> Result<NextAction, anyhow::Error> {
    let mut transaction = pool.begin().await?;
    let query = sqlx::query!(
        r#"
        INSERT INTO idempotency (
        user_id,
        idempotency_key,
        created_at
        )
        VALUES ($1, $2, now())
        ON CONFLICT DO NOTHING
        "#,
        user_id,
        idempotency_key.as_ref()
    );
    let n_inserted_rows = transaction.execute(query).await?.rows_affected();
    if n_inserted_rows > 0 {
        Ok(NextAction::StartProcessing(transaction))
    } else {
        // Roll back unused transaction
        transaction.rollback().await?;
        let saved_response = get_saved_response(pool, idempotency_key, user_id).await?;
        match saved_response {
            Some(saved_response) => {
                // Internal sentinel: we use 408 to signal "idempotency key expired"
                match saved_response.status() {
                    StatusCode::REQUEST_TIMEOUT => {
                        // Start a new transaction for processing
                        let new_transaction = pool.begin().await?;
                        Ok(NextAction::StartProcessing(new_transaction))
                    }
                    _ => Ok(NextAction::ReturnSavedResponse(saved_response)),
                }
            }
            None => {
                tracing::warn!("Saved response could not be retrieved");
                // Start a new transaction for processing
                let new_transaction = pool.begin().await?;
                Ok(NextAction::StartProcessing(new_transaction))
            }
        }
    }
}

pub async fn save_response(
    mut transaction: Transaction<'static, Postgres>,
    idempotency_key: &IdempotencyKey,
    user_id: Uuid,
    response: Response,
) -> Result<Response, anyhow::Error> {
    let (response_parts, body) = response.into_parts();
    let body_bytes = body.collect().await?.to_bytes();
    let status_code = response_parts.status.as_u16() as i16;
    let headers = {
        let mut header = Vec::with_capacity(response_parts.headers.len());
        for (name, value) in response_parts.headers.iter() {
            let name = name.as_str().to_owned();
            let value = value.as_bytes().to_owned();
            header.push(HeaderPairRecord { name, value });
        }
        header
    };

    let query = sqlx::query_unchecked!(
        r#"
        UPDATE idempotency
        SET
            response_status_code = $3,
            response_headers = $4,
            response_body = $5
        WHERE
            user_id = $1 AND
            idempotency_key = $2
        "#,
        user_id,
        idempotency_key.as_ref(),
        status_code,
        headers,
        body_bytes.as_ref()
    );
    transaction.execute(query).await?;
    transaction.commit().await?;

    Ok((response_parts.status, response_parts.headers, body_bytes).into_response())
}
