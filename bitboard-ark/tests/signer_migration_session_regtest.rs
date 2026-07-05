//! ArkSession signer migration against live arkade-regtest.
//!
//! Run when the regtest stack is up (serial — tests share rotate-signer + Docker):
//! `ARKADE_REGTEST_RUN=1 cargo test -p bitboard-ark --test signer_migration_session_regtest -- --ignored --nocapture --test-threads=1`
//!
//! Full migration with boarded funds requires a WASM-exported fixture:
//! `ARKADE_REGTEST_BOARDED_FIXTURE=/tmp/arkade-boarded-fixture.json` (see E2E
//! `ARKADE_REGTEST_EXPORT_BOARDED_FIXTURE` in `prepareSignerMigrationScenario`).

#![cfg(not(target_arch = "wasm32"))]

use std::path::PathBuf;

use bitboard_ark::{ArkSession, NetworkMode};
use serde_json::Value;

mod support;

use support::regtest_integration::{
    ArkPauseGuard, DEFAULT_BOARD_SATS, RegtestEndpoints, fresh_test_mnemonic,
    fund_and_board_wallet, open_session, regtest_enabled, regtest_endpoints, restart_arkd_operator,
    rotate_signer_with_future_cutoff,
};

static REGTEST_INTEGRATION_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

async fn lock_regtest_suite() -> tokio::sync::MutexGuard<'static, ()> {
    REGTEST_INTEGRATION_LOCK.lock().await
}

struct DeprecatedSignerFixture {
    session: ArkSession,
    deprecated_signer: String,
}

#[derive(serde::Serialize, serde::Deserialize)]
struct BoardedWalletFixture {
    mnemonic: String,
    persistence_before_rotate: String,
}

fn load_boarded_fixture() -> Option<BoardedWalletFixture> {
    let path = std::env::var("ARKADE_REGTEST_BOARDED_FIXTURE").ok()?;
    let json = std::fs::read_to_string(&path).ok()?;
    serde_json::from_str(&json).ok()
}

fn parse_persistence_operator_signer(persistence_json: &str) -> String {
    let parsed: Value = serde_json::from_str(persistence_json).expect("persistence json");
    parsed["operator_identity"]["signer_pk_hex"]
        .as_str()
        .expect("operator signer in persistence")
        .to_string()
}

async fn board_fresh_wallet(endpoints: &RegtestEndpoints) -> (ArkSession, String) {
    restart_arkd_operator(endpoints).await;

    let mnemonic = fresh_test_mnemonic();
    let session = open_session(endpoints, &mnemonic, None).await;
    session
        .sync_with_operator()
        .await
        .expect("initial operator sync");

    fund_and_board_wallet(endpoints, &session, DEFAULT_BOARD_SATS).await;

    session.sync_with_operator().await.expect("post-board sync");
    let balance_after_board = session.balance().await.expect("balance after board");
    assert!(
        balance_after_board.offchain_spendable_sats > 0 || balance_after_board.confirmed_sats > 0,
        "expected Arkade balance after boarding"
    );

    (session, mnemonic)
}

async fn prepare_deprecated_signer_fixture(
    endpoints: &RegtestEndpoints,
) -> DeprecatedSignerFixture {
    if let Some(fixture) = load_boarded_fixture() {
        let deprecated_signer =
            parse_persistence_operator_signer(&fixture.persistence_before_rotate);
        rotate_signer_with_future_cutoff();
        restart_arkd_operator(endpoints).await;
        let (session, migration_hint) = ArkSession::open(
            &fixture.mnemonic,
            NetworkMode::Regtest,
            endpoints.arkd_url.clone(),
            String::new(),
            endpoints.esplora_url.clone(),
            Some(&fixture.persistence_before_rotate),
        )
        .await
        .expect("reopen after rotate from boarded fixture");
        assert!(
            migration_hint.is_some(),
            "expected migration hint after operator signer rotation"
        );
        return DeprecatedSignerFixture {
            session,
            deprecated_signer,
        };
    }

    let (session, mnemonic) = board_fresh_wallet(endpoints).await;

    let persistence_before_rotate = session.export_persistence().expect("export before rotate");
    let deprecated_signer = parse_persistence_operator_signer(&persistence_before_rotate);

    rotate_signer_with_future_cutoff();
    restart_arkd_operator(endpoints).await;

    let (session, migration_hint) = ArkSession::open(
        &mnemonic,
        NetworkMode::Regtest,
        endpoints.arkd_url.clone(),
        String::new(),
        endpoints.esplora_url.clone(),
        Some(&persistence_before_rotate),
    )
    .await
    .expect("reopen after rotate");
    assert!(
        migration_hint.is_some(),
        "expected migration hint after operator signer rotation"
    );

    DeprecatedSignerFixture {
        session,
        deprecated_signer,
    }
}

async fn prepare_deprecated_signer_session_without_boarding(
    endpoints: &RegtestEndpoints,
) -> DeprecatedSignerFixture {
    restart_arkd_operator(endpoints).await;

    let mnemonic = fresh_test_mnemonic();
    let session = open_session(endpoints, &mnemonic, None).await;
    let persistence_before_rotate = session.export_persistence().expect("export before rotate");
    let deprecated_signer = parse_persistence_operator_signer(&persistence_before_rotate);

    rotate_signer_with_future_cutoff();
    restart_arkd_operator(endpoints).await;

    let (session, migration_hint) = ArkSession::open(
        &mnemonic,
        NetworkMode::Regtest,
        endpoints.arkd_url.clone(),
        String::new(),
        endpoints.esplora_url.clone(),
        Some(&persistence_before_rotate),
    )
    .await
    .expect("reopen after rotate");
    assert!(
        migration_hint.is_some(),
        "expected migration hint after operator signer rotation"
    );

    DeprecatedSignerFixture {
        session,
        deprecated_signer,
    }
}

#[tokio::test]
#[ignore = "requires arkade-regtest stack: ARKADE_REGTEST_RUN=1 cargo test --test signer_migration_session_regtest -- --ignored"]
async fn cooperative_signer_migration_stamps_current_signer_after_complete() {
    if !regtest_enabled() {
        return;
    }
    let _regtest_lock = lock_regtest_suite().await;

    let endpoints = regtest_endpoints();
    // No boarded funds: cooperative migration is already complete (nothing on deprecated signer).
    let fixture = prepare_deprecated_signer_session_without_boarding(&endpoints).await;

    let migration_result = fixture
        .session
        .migrate_deprecated_signer_vtxos()
        .await
        .expect("cooperative migration");
    assert!(migration_result.migration_complete);

    let exported = fixture
        .session
        .export_persistence()
        .expect("export after migrate");
    let persisted_signer = parse_persistence_operator_signer(&exported);
    assert_ne!(persisted_signer, fixture.deprecated_signer);

    fixture
        .session
        .sync_with_operator()
        .await
        .expect("post-migrate sync");
    let balance_after = fixture
        .session
        .balance()
        .await
        .expect("balance after migrate");
    assert_eq!(balance_after.pending_recovery_sats, 0);
}

#[tokio::test]
#[ignore = "requires boarded fixture from E2E: ARKADE_REGTEST_BOARDED_FIXTURE=/path/to/fixture.json ARKADE_REGTEST_RUN=1 cargo test cooperative_signer_migration_clears_pending_recovery -- --ignored"]
async fn cooperative_signer_migration_clears_pending_recovery_with_boarded_fixture() {
    if !regtest_enabled() {
        return;
    }
    let fixture_path = match std::env::var("ARKADE_REGTEST_BOARDED_FIXTURE") {
        Ok(path) if !path.is_empty() => path,
        _ => {
            eprintln!(
                "SKIP cooperative_signer_migration_clears_pending_recovery_with_boarded_fixture: \
                 set ARKADE_REGTEST_BOARDED_FIXTURE to a JSON file exported after WASM boarding \
                 (E2E prepareSignerMigrationScenario with ARKADE_REGTEST_EXPORT_BOARDED_FIXTURE)"
            );
            return;
        }
    };
    if !PathBuf::from(&fixture_path).is_file() {
        panic!("ARKADE_REGTEST_BOARDED_FIXTURE file not found: {fixture_path}");
    }

    let _regtest_lock = lock_regtest_suite().await;
    let endpoints = regtest_endpoints();
    let fixture = prepare_deprecated_signer_fixture(&endpoints).await;

    let migration_result = fixture
        .session
        .migrate_deprecated_signer_vtxos()
        .await
        .expect("cooperative migration with boarded funds");
    assert!(migration_result.migration_complete);
    assert!(migration_result.pass_count >= 1);

    let exported = fixture
        .session
        .export_persistence()
        .expect("export after migrate");
    assert_ne!(
        parse_persistence_operator_signer(&exported),
        fixture.deprecated_signer
    );

    fixture
        .session
        .sync_with_operator()
        .await
        .expect("post-migrate sync");
    let balance_after = fixture
        .session
        .balance()
        .await
        .expect("balance after migrate");
    assert_eq!(balance_after.pending_recovery_sats, 0);
}

#[tokio::test]
#[ignore = "requires arkade-regtest stack: ARKADE_REGTEST_RUN=1 cargo test --test signer_migration_session_regtest -- --ignored"]
async fn migrate_fails_fast_when_discover_keys_cannot_run() {
    if !regtest_enabled() {
        return;
    }
    let _regtest_lock = lock_regtest_suite().await;

    let endpoints = regtest_endpoints();
    let fixture = prepare_deprecated_signer_session_without_boarding(&endpoints).await;

    let _resume_arkd = ArkPauseGuard::pause_arkd_operator(&endpoints);

    let error = fixture
        .session
        .migrate_deprecated_signer_vtxos()
        .await
        .expect_err("migrate should fail when discover_keys cannot reach arkd");
    let message = error.to_string();
    assert!(
        message.contains("Offchain receive keys could not be refreshed"),
        "unexpected migrate error: {message}"
    );

    let exported = fixture
        .session
        .export_persistence()
        .expect("export after failed migrate");
    assert_eq!(
        parse_persistence_operator_signer(&exported),
        fixture.deprecated_signer
    );
}

#[tokio::test]
#[ignore = "optional helper — set ARKADE_REGTEST_EXPORT_NATIVE_BOARDED_FIXTURE=1; prefer E2E ARKADE_REGTEST_EXPORT_BOARDED_FIXTURE"]
async fn export_boarded_wallet_fixture() {
    if !regtest_enabled() {
        return;
    }
    if std::env::var("ARKADE_REGTEST_EXPORT_NATIVE_BOARDED_FIXTURE").as_deref() != Ok("1") {
        eprintln!(
            "SKIP export_boarded_wallet_fixture: native boarding is flaky — use E2E \
             ARKADE_REGTEST_EXPORT_BOARDED_FIXTURE or set ARKADE_REGTEST_EXPORT_NATIVE_BOARDED_FIXTURE=1"
        );
        return;
    }
    let _regtest_lock = lock_regtest_suite().await;
    let endpoints = regtest_endpoints();
    let (session, mnemonic) = board_fresh_wallet(&endpoints).await;
    let persistence_before_rotate = session.export_persistence().expect("export");
    let fixture = BoardedWalletFixture {
        mnemonic,
        persistence_before_rotate,
    };
    let path = std::env::var("ARKADE_REGTEST_BOARDED_FIXTURE")
        .unwrap_or_else(|_| "/tmp/arkade-boarded-fixture.json".to_string());
    std::fs::write(
        &path,
        serde_json::to_string_pretty(&fixture).expect("serialize fixture"),
    )
    .expect("write fixture");
    eprintln!("wrote boarded wallet fixture to {path}");
}
