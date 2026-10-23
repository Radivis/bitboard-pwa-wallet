mod support;

use support::regtest_integration::{open_fresh_regtest_wallet, regtest_enabled, regtest_endpoints};

static REGTEST_INTEGRATION_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

/// An empty wallet submits a PSBT captaind rejects. No spendable VTXO is written.
#[tokio::test]
#[ignore = "requires the bark-regtest stack (captaind); BARK_REGTEST_RUN=1 --features regtest-support"]
async fn board_submission_rejected() {
    if !regtest_enabled() {
        return;
    }
    let _regtest_lock = REGTEST_INTEGRATION_LOCK.lock().await;
    let endpoints = regtest_endpoints();
    let wallet = open_fresh_regtest_wallet(&endpoints).await;

    let rejected = wallet
        .board_psbt()
        .await
        .expect_err("captaind should reject an unfunded board PSBT");
    assert!(
        rejected.to_lowercase().contains("cosign") || rejected.to_lowercase().contains("expir"),
        "captaind did not reject the board cosign: {rejected}"
    );
    let spendable = wallet.spendable_vtxo_ids().await.expect("spendable vtxos");
    assert!(
        spendable.is_empty(),
        "rejected board wrote spendable vtxos: {spendable:?}"
    );
}
