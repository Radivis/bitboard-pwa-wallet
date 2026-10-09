use bitboard_bark::{BARK_MAINNET_ESPLORA_URL, BARK_MAINNET_SERVER_URL};

/// Genesis block hash of Bitcoin mainnet.
const MAINNET_GENESIS_HASH: &str =
    "000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f";

#[tokio::test]
#[ignore = "hits Second public mainnet; run with --ignored"]
async fn public_mainnet_server_and_esplora_answer() {
    let http_client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(20))
        .build()
        .expect("http client");

    let genesis_url = format!("{BARK_MAINNET_ESPLORA_URL}/block-height/0");
    let esplora_response = http_client
        .get(&genesis_url)
        .send()
        .await
        .expect("esplora request");
    assert!(
        esplora_response.status().is_success(),
        "esplora genesis status: {}",
        esplora_response.status()
    );
    let allow_origin = esplora_response
        .headers()
        .get("access-control-allow-origin")
        .and_then(|value| value.to_str().ok())
        .unwrap_or("");
    assert!(
        allow_origin == "*" || allow_origin.starts_with("http"),
        "esplora did not send Access-Control-Allow-Origin; the Bark worker needs a same-origin proxy. got {allow_origin:?}"
    );
    let genesis_hash = esplora_response.text().await.expect("esplora body");
    assert_eq!(genesis_hash.trim(), MAINNET_GENESIS_HASH);

    let server_response = http_client
        .get(BARK_MAINNET_SERVER_URL)
        .send()
        .await
        .expect("ark server request");
    assert!(
        server_response.status().as_u16() > 0,
        "ark server returned no http status"
    );
    let server_allow_origin = server_response
        .headers()
        .get("access-control-allow-origin")
        .and_then(|value| value.to_str().ok())
        .unwrap_or("");
    assert!(
        server_allow_origin == "*" || server_allow_origin.starts_with("http"),
        "ark server did not send Access-Control-Allow-Origin; the Bark worker needs a same-origin proxy. got {server_allow_origin:?}"
    );
}
