mod support;

use support::regtest_integration::{
    CaptaindPauseGuard, open_fresh_regtest_wallet, regtest_enabled, regtest_endpoints,
};

static REGTEST_INTEGRATION_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

/// Sync while captaind is stopped must fail, and that call must not rewrite the record envelope.
#[tokio::test]
#[ignore = "requires the bark-regtest stack (captaind); BARK_REGTEST_RUN=1 --features regtest-support"]
async fn sync_fails_when_server_stopped_leaves_record_envelope_unchanged() {
    if !regtest_enabled() {
        return;
    }
    let _regtest_lock = REGTEST_INTEGRATION_LOCK.lock().await;
    let endpoints = regtest_endpoints();
    let wallet = open_fresh_regtest_wallet(&endpoints).await;
    let envelope_before = wallet.export_encoded_envelope().expect("envelope before");

    let _resume_captaind = CaptaindPauseGuard::pause(&endpoints);
    wallet
        .refresh_server()
        .await
        .expect_err("refresh_server should fail while captaind is stopped");

    let envelope_after = wallet.export_encoded_envelope().expect("envelope after");
    assert_eq!(envelope_before, envelope_after);
}
