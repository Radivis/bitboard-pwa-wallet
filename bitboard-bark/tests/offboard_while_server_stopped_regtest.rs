mod support;

use bitboard_bark::regtest_session::regtest_receive_address;
use support::regtest_integration::{
    CaptaindPauseGuard, open_boarded_fixture, regtest_enabled, regtest_endpoints,
};

static REGTEST_INTEGRATION_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

/// Offboard fails while captaind is stopped. Re-opening the dump keeps the same spendable ids.
#[tokio::test]
#[ignore = "requires the bark-regtest stack and BARK_REGTEST_BOARDED_FIXTURE; BARK_REGTEST_RUN=1"]
async fn offboard_while_server_stopped() {
    if !regtest_enabled() {
        return;
    }
    let _regtest_lock = REGTEST_INTEGRATION_LOCK.lock().await;
    let endpoints = regtest_endpoints();
    let wallet = open_boarded_fixture(&endpoints).await;
    wallet.sync().await;
    let spendable_before = wallet.spendable_vtxo_ids().await.expect("spendable before");
    assert!(
        !spendable_before.is_empty(),
        "boarded fixture has no spendable VTXO"
    );

    let _resume_captaind = CaptaindPauseGuard::pause(&endpoints);
    wallet
        .offboard_all(regtest_receive_address())
        .await
        .expect_err("offboard_all should fail while captaind is stopped");
    let dump_after = wallet.export_encoded_dump().expect("dump after");
    drop(wallet);
    drop(_resume_captaind);

    let reopened = bitboard_bark::regtest_session::RegtestBarkWallet::open_from_encoded_dump(
        &support::regtest_integration::load_boarded_fixture().0,
        &dump_after,
        &endpoints.captaind_url,
        &endpoints.esplora_url,
    )
    .await
    .expect("reopen dump");
    let spendable_after = reopened.spendable_vtxo_ids().await.expect("spendable after");
    assert_eq!(spendable_before, spendable_after);
}
