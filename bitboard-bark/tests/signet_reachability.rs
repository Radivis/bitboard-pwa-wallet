use bitboard_bark::{BARK_SIGNET_ESPLORA_URL, BARK_SIGNET_SERVER_URL};

#[tokio::test]
#[ignore = "hits Second public Signet; run with --ignored"]
async fn public_signet_server_and_esplora_answer() {
    let http_client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(20))
        .build()
        .expect("http client");

    let esplora_tip_url = format!("{BARK_SIGNET_ESPLORA_URL}/blocks/tip/height");
    let esplora_response = http_client
        .get(&esplora_tip_url)
        .send()
        .await
        .expect("esplora request");
    assert!(
        esplora_response.status().is_success(),
        "esplora tip height status: {}",
        esplora_response.status()
    );
    let tip_height_text = esplora_response.text().await.expect("esplora body");
    tip_height_text
        .trim()
        .parse::<u64>()
        .expect("esplora tip height is a decimal integer");

    let server_response = http_client
        .get(BARK_SIGNET_SERVER_URL)
        .send()
        .await
        .expect("ark server request");
    assert!(
        server_response.status().as_u16() > 0,
        "ark server returned no http status"
    );
}
