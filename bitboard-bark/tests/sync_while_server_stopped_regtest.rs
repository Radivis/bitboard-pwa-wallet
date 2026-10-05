mod support;

use support::regtest_integration::{
    CaptaindPauseGuard, open_fresh_regtest_wallet, regtest_enabled, regtest_endpoints,
};

static REGTEST_INTEGRATION_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

/// Sync while captaind is stopped must fail, and that call must not rewrite the record dump.
#[tokio::test]
#[ignore = "requires the bark-regtest stack (captaind); BARK_REGTEST_RUN=1 --features regtest-support"]
async fn sync_fails_when_server_stopped_leaves_record_dump_unchanged() {
    if !regtest_enabled() {
        return;
    }
    let _regtest_lock = REGTEST_INTEGRATION_LOCK.lock().await;
    let endpoints = regtest_endpoints();
    let wallet = open_fresh_regtest_wallet(&endpoints).await;
    let dump_before = wallet.export_encoded_dump().expect("dump before");

    let _resume_captaind = CaptaindPauseGuard::pause(&endpoints);
    wallet
        .refresh_server()
        .await
        .expect_err("refresh_server should fail while captaind is stopped");

    let dump_after = wallet.export_encoded_dump().expect("dump after");
    assert_eq!(dump_before, dump_after);
}
