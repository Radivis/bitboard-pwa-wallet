mod common;

use bitcoin::Network;
use bitboard_crypto::transaction;
use common::wallet_fixtures::{
    create_test_wallet, fund_test_wallet, DEFAULT_ADDRESS_TYPE, DEFAULT_NETWORK,
};

const VALID_SIGNET_ADDRESS: &str = "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx";
const FUNDING_AMOUNT: u64 = 100_000;
const SEND_AMOUNT: u64 = 10_000;
const FEE_RATE: f64 = 2.0;

fn funded_wallet() -> bdk_wallet::Wallet {
    let mut wallet = create_test_wallet(DEFAULT_NETWORK, DEFAULT_ADDRESS_TYPE);
    fund_test_wallet(&mut wallet, FUNDING_AMOUNT);
    wallet
}

// --- Error case tests ---

#[test]
fn build_transaction_rejects_invalid_address() {
    let mut wallet = funded_wallet();
    let result = transaction::build_transaction(
        &mut wallet,
        "not-a-bitcoin-address",
        SEND_AMOUNT,
        FEE_RATE,
        Network::Signet,
    );
    assert!(result.is_err(), "Invalid address must be rejected");
}

#[test]
fn build_transaction_rejects_insufficient_funds() {
    let mut wallet = create_test_wallet(DEFAULT_NETWORK, DEFAULT_ADDRESS_TYPE);
    let result = transaction::build_transaction(
        &mut wallet,
        VALID_SIGNET_ADDRESS,
        SEND_AMOUNT,
        FEE_RATE,
        Network::Signet,
    );
    assert!(result.is_err(), "Wallet with no UTXOs must reject tx build");
}

#[test]
fn build_transaction_rejects_zero_amount() {
    let mut wallet = funded_wallet();
    let result = transaction::build_transaction(
        &mut wallet,
        VALID_SIGNET_ADDRESS,
        0,
        FEE_RATE,
        Network::Signet,
    );
    assert!(result.is_err(), "Zero-amount transaction must be rejected");
}

// --- Happy-path tests ---

#[test]
fn build_transaction_creates_valid_psbt() {
    let mut wallet = funded_wallet();
    let psbt = transaction::build_transaction(
        &mut wallet,
        VALID_SIGNET_ADDRESS,
        SEND_AMOUNT,
        FEE_RATE,
        Network::Signet,
    )
    .expect("Building a transaction with sufficient funds should succeed");

    assert!(
        !psbt.unsigned_tx.output.is_empty(),
        "PSBT must contain at least one output"
    );

    let has_recipient_output = psbt.unsigned_tx.output.iter().any(|o| {
        o.value.to_sat() == SEND_AMOUNT
    });
    assert!(has_recipient_output, "PSBT must contain the recipient output");
}

#[test]
fn build_transaction_respects_fee_rate() {
    let mut wallet = funded_wallet();
    let psbt = transaction::build_transaction(
        &mut wallet,
        VALID_SIGNET_ADDRESS,
        SEND_AMOUNT,
        FEE_RATE,
        Network::Signet,
    )
    .expect("Building a transaction should succeed");

    let total_input: u64 = psbt
        .unsigned_tx
        .input
        .iter()
        .zip(psbt.inputs.iter())
        .map(|(_txin, psbt_input)| {
            psbt_input
                .witness_utxo
                .as_ref()
                .map(|utxo| utxo.value.to_sat())
                .unwrap_or(0)
        })
        .sum();
    let total_output: u64 = psbt.unsigned_tx.output.iter().map(|o| o.value.to_sat()).sum();
    let fee = total_input.saturating_sub(total_output);

    assert!(fee > 0, "Transaction must have a non-zero fee");
}

// --- Signing and extraction tests ---

#[test]
fn sign_transaction_produces_finalized_psbt() {
    let mut wallet = funded_wallet();
    let mut psbt = transaction::build_transaction(
        &mut wallet,
        VALID_SIGNET_ADDRESS,
        SEND_AMOUNT,
        FEE_RATE,
        Network::Signet,
    )
    .expect("Build should succeed");

    let finalized =
        transaction::sign_transaction(&wallet, &mut psbt).expect("Signing should succeed");
    assert!(finalized, "PSBT must be finalized after signing");
}

#[test]
fn extract_transaction_returns_valid_tx() {
    let mut wallet = funded_wallet();
    let mut psbt = transaction::build_transaction(
        &mut wallet,
        VALID_SIGNET_ADDRESS,
        SEND_AMOUNT,
        FEE_RATE,
        Network::Signet,
    )
    .expect("Build should succeed");

    transaction::sign_transaction(&wallet, &mut psbt).expect("Signing should succeed");

    let tx = transaction::extract_transaction(psbt).expect("Extraction should succeed");
    assert!(
        !tx.input.is_empty(),
        "Extracted transaction must have inputs"
    );
    assert!(
        !tx.output.is_empty(),
        "Extracted transaction must have outputs"
    );
}
