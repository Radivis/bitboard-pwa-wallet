#![cfg(not(target_arch = "wasm32"))]

mod common;

use async_trait::async_trait;
use bdk_wallet::{Update, Wallet};
use bitcoin::{Transaction, Txid};
use mockall::mock;

use bitboard_crypto::blockchain::BlockchainClient;
use bitboard_crypto::esplora::EsploraClient;
use bitboard_crypto::error::CryptoError;
use bitboard_crypto::sync;
use bitboard_crypto::wallet;
use common::esplora_mocks::{mock_broadcast_rejection, mock_broadcast_success, start_mock_esplora};
use common::wallet_fixtures::{
    create_test_wallet, fund_test_wallet, DEFAULT_ADDRESS_TYPE, DEFAULT_NETWORK,
};

mock! {
    pub BC {}

    #[async_trait]
    impl BlockchainClient for BC {
        async fn full_scan(
            &self,
            wallet: &Wallet,
            stop_gap: usize,
            parallel_requests: usize,
        ) -> Result<Update, CryptoError>;

        async fn sync(
            &self,
            wallet: &Wallet,
            parallel_requests: usize,
        ) -> Result<Update, CryptoError>;

        async fn broadcast(&self, tx: &Transaction) -> Result<Txid, CryptoError>;
    }
}

// --- EsploraClient construction tests ---

#[test]
fn esplora_client_new_accepts_valid_url() {
    let result = EsploraClient::new("https://mempool.space/signet/api");
    assert!(result.is_ok(), "Valid URL must be accepted");
}

#[test]
fn esplora_client_new_rejects_empty_url() {
    let result = EsploraClient::new("");
    assert!(result.is_err(), "Empty URL must be rejected");
}

// --- Sync tests (using MockBlockchainClient) ---

#[tokio::test]
async fn sync_wallet_applies_update() {
    let mut wallet = create_test_wallet(DEFAULT_NETWORK, DEFAULT_ADDRESS_TYPE);

    let mut mock_client = MockBC::new();
    mock_client
        .expect_sync()
        .returning(|_wallet, _parallel| Ok(Update::default()));

    let result = sync::sync_wallet(&mut wallet, &mock_client, 1).await;
    assert!(result.is_ok(), "Sync with default update should succeed");
}

#[tokio::test]
async fn full_scan_wallet_applies_update() {
    let mut wallet = create_test_wallet(DEFAULT_NETWORK, DEFAULT_ADDRESS_TYPE);

    let mut mock_client = MockBC::new();
    mock_client
        .expect_full_scan()
        .returning(|_wallet, _stop_gap, _parallel| Ok(Update::default()));

    let result = sync::full_scan_wallet(&mut wallet, &mock_client, 20, 1).await;
    assert!(result.is_ok(), "Full scan with default update should succeed");
}

#[tokio::test]
async fn sync_wallet_propagates_client_error() {
    let mut wallet = create_test_wallet(DEFAULT_NETWORK, DEFAULT_ADDRESS_TYPE);

    let mut mock_client = MockBC::new();
    mock_client
        .expect_sync()
        .returning(|_wallet, _parallel| {
            Err(CryptoError::Blockchain("connection refused".to_string()))
        });

    let result = sync::sync_wallet(&mut wallet, &mock_client, 1).await;
    assert!(result.is_err(), "Sync must propagate client errors");
}

#[tokio::test]
async fn full_scan_wallet_propagates_client_error() {
    let mut wallet = create_test_wallet(DEFAULT_NETWORK, DEFAULT_ADDRESS_TYPE);

    let mut mock_client = MockBC::new();
    mock_client
        .expect_full_scan()
        .returning(|_wallet, _stop_gap, _parallel| {
            Err(CryptoError::Blockchain("timeout".to_string()))
        });

    let result = sync::full_scan_wallet(&mut wallet, &mock_client, 20, 1).await;
    assert!(result.is_err(), "Full scan must propagate client errors");
}

// --- Broadcast tests (using wiremock) ---

#[tokio::test]
async fn broadcast_returns_txid_on_success() {
    let server = start_mock_esplora().await;
    let expected_txid = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
    mock_broadcast_success(&server, expected_txid).await;

    let client = EsploraClient::new(&server.uri()).expect("Client creation should succeed");

    let mut wallet = create_test_wallet(DEFAULT_NETWORK, DEFAULT_ADDRESS_TYPE);
    fund_test_wallet(&mut wallet, 100_000);

    let mut psbt = bitboard_crypto::transaction::build_transaction(
        &mut wallet,
        "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx",
        10_000,
        2.0,
        bitcoin::Network::Signet,
    )
    .expect("Build should succeed");
    bitboard_crypto::transaction::sign_transaction(&wallet, &mut psbt)
        .expect("Sign should succeed");
    let tx = bitboard_crypto::transaction::extract_transaction(psbt)
        .expect("Extract should succeed");

    let result = client.broadcast(&tx).await;
    assert!(result.is_ok(), "Broadcast to mock server should succeed");
}

#[tokio::test]
async fn broadcast_handles_rejection() {
    let server = start_mock_esplora().await;
    mock_broadcast_rejection(&server, "TX rejected: insufficient fee").await;

    let client = EsploraClient::new(&server.uri()).expect("Client creation should succeed");

    let mut wallet = create_test_wallet(DEFAULT_NETWORK, DEFAULT_ADDRESS_TYPE);
    fund_test_wallet(&mut wallet, 100_000);

    let mut psbt = bitboard_crypto::transaction::build_transaction(
        &mut wallet,
        "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx",
        10_000,
        2.0,
        bitcoin::Network::Signet,
    )
    .expect("Build should succeed");
    bitboard_crypto::transaction::sign_transaction(&wallet, &mut psbt)
        .expect("Sign should succeed");
    let tx = bitboard_crypto::transaction::extract_transaction(psbt)
        .expect("Extract should succeed");

    let result = client.broadcast(&tx).await;
    assert!(result.is_err(), "Rejected broadcast must return an error");
}

// --- Transaction history tests ---

#[test]
fn get_transaction_list_returns_empty_for_new_wallet() {
    let wallet = create_test_wallet(DEFAULT_NETWORK, DEFAULT_ADDRESS_TYPE);
    let txs = wallet::get_transaction_list(&wallet);
    assert!(txs.is_empty(), "New wallet must have no transactions");
}

#[test]
fn get_transaction_list_includes_funded_transaction() {
    let mut wallet = create_test_wallet(DEFAULT_NETWORK, DEFAULT_ADDRESS_TYPE);
    fund_test_wallet(&mut wallet, 50_000);

    let txs = wallet::get_transaction_list(&wallet);
    assert_eq!(txs.len(), 1, "Funded wallet must have exactly one transaction");
    assert_eq!(txs[0].received_sats, 50_000);
    assert!(txs[0].is_confirmed);
}
