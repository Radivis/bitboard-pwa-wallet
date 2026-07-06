//! ArkSession signer migration against live arkade-regtest.
//!
//! Run when the regtest stack is up (serial — tests share rotate-signer + Docker):
//! `ARKADE_REGTEST_RUN=1 cargo test -p bitboard-ark --test signer_migration_session_regtest -- --ignored --nocapture --test-threads=1`
//!
//! Full migration with boarded funds:
//! - **Reliable:** `ARKADE_REGTEST_BOARDED_FIXTURE` from E2E (`ARKADE_REGTEST_EXPORT_BOARDED_FIXTURE`)
//!   → `cooperative_signer_migration_clears_pending_recovery_with_boarded_fixture`
//! - **Experimental:** `cooperative_signer_migration_clears_pending_recovery_with_native_boarding`
//!   boards via native Rust/tonic (batch nonce ordering differs from WASM; often fails on regtest).

#![cfg(not(target_arch = "wasm32"))]

use bitboard_ark::{ArkSession, NetworkMode};
use serde_json::Value;

mod support;

use support::regtest_integration::{
    ArkPauseGuard, DEFAULT_BOARD_SATS, DEFAULT_BOARDED_FIXTURE_RELATIVE, RegtestEndpoints,
    fresh_test_mnemonic, open_session, prepare_boarded_session, regtest_enabled, regtest_endpoints,
    repo_root, resolve_regtest_fixture_path, restart_arkd_operator,
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
    let resolved = resolve_regtest_fixture_path(&path);
    let json = std::fs::read_to_string(&resolved).ok()?;
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
    prepare_boarded_session(endpoints, DEFAULT_BOARD_SATS).await
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
#[ignore = "experimental native tonic boarding — requires ARKD_VTXO_TREE_EXPIRY=200 npm run regtest:clean-start; on failure use boarded_fixture + E2E export. ARKADE_REGTEST_RUN=1 cargo test cooperative_signer_migration_clears_pending_recovery_with_native_boarding --test signer_migration_session_regtest -- --ignored --nocapture --test-threads=1"]
async fn cooperative_signer_migration_clears_pending_recovery_with_native_boarding() {
    if !regtest_enabled() {
        return;
    }
    let _regtest_lock = lock_regtest_suite().await;

    let endpoints = regtest_endpoints();
    let (session, mnemonic) = board_fresh_wallet(&endpoints).await;

    let persistence_before_rotate = session.export_persistence().expect("export before rotate");
    let deprecated_signer = parse_persistence_operator_signer(&persistence_before_rotate);

    rotate_signer_with_future_cutoff();
    restart_arkd_operator(&endpoints).await;

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

    let migration_result = session
        .migrate_deprecated_signer_vtxos()
        .await
        .expect("cooperative migration with native boarded funds");
    assert!(migration_result.migration_complete);
    assert!(migration_result.pass_count >= 1);

    let exported = session.export_persistence().expect("export after migrate");
    assert_ne!(
        parse_persistence_operator_signer(&exported),
        deprecated_signer
    );

    session
        .sync_with_operator()
        .await
        .expect("post-migrate sync");
    let balance_after = session.balance().await.expect("balance after migrate");
    assert_eq!(balance_after.pending_recovery_sats, 0);
}

#[tokio::test]
#[ignore = "requires boarded fixture from E2E: ARKADE_REGTEST_BOARDED_FIXTURE=/path/to/fixture.json ARKADE_REGTEST_RUN=1 cargo test cooperative_signer_migration_clears_pending_recovery -- --ignored"]
async fn cooperative_signer_migration_clears_pending_recovery_with_boarded_fixture() {
    if !regtest_enabled() {
        return;
    }
    let fixture_path = match std::env::var("ARKADE_REGTEST_BOARDED_FIXTURE") {
        Ok(path) if !path.is_empty() => resolve_regtest_fixture_path(&path),
        _ => {
            eprintln!(
                "SKIP cooperative_signer_migration_clears_pending_recovery_with_boarded_fixture: \
                 set ARKADE_REGTEST_BOARDED_FIXTURE to a JSON file exported after WASM boarding \
                 (E2E prepareSignerMigrationScenario with ARKADE_REGTEST_EXPORT_BOARDED_FIXTURE)"
            );
            return;
        }
    };
    if !fixture_path.is_file() {
        panic!(
            "ARKADE_REGTEST_BOARDED_FIXTURE file not found: {} (cwd is {:?}; repo root is {:?}). \
             Export it first from frontend/ after a clean long-expiry stack, e.g.\n  \
             ARKADE_REGTEST_EXPORT_BOARDED_FIXTURE=1 REQUIRE_ARKADE_REGTEST=1 \
             VITE_E2E_ARKADE_REGTEST=true npx playwright test tests/e2e/arkade-signer-migration-regtest.spec.ts\n  \
             then ARKADE_REGTEST_BOARDED_FIXTURE={DEFAULT_BOARDED_FIXTURE_RELATIVE} from repo root.",
            fixture_path.display(),
            std::env::current_dir().ok(),
            repo_root(),
        );
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
