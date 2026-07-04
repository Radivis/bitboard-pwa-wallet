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
use std::process::Command;
use std::time::Duration;

use bip39::{Language, Mnemonic};
use bitboard_ark::{ArkSession, NetworkMode};
use serde::Deserialize;
use serde_json::Value;

const DEFAULT_ARKD_URL: &str = "http://localhost:7070";
const DEFAULT_ESPLORA_URL: &str = "http://localhost:7030/api";
const DEFAULT_ARKD_CONTAINER: &str = "bitboard-regtest-arkd";
const BOARD_SATS: u64 = 200_000;
/// Matches E2E `BOARDING_COOPERATIVE_SETTLE_BUDGET_MS` — fund → settle must finish inside arkd's ~30s window.
const BOARDING_COOPERATIVE_SETTLE_BUDGET: Duration = Duration::from_secs(25);
const BOARDING_ESPLORA_CONFIRM_TIMEOUT: Duration = Duration::from_secs(20);

static REGTEST_INTEGRATION_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

fn lock_regtest_suite() -> std::sync::MutexGuard<'static, ()> {
    REGTEST_INTEGRATION_LOCK
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

struct RegtestEndpoints {
    arkd_url: String,
    esplora_url: String,
    arkd_container: String,
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

fn regtest_enabled() -> bool {
    std::env::var("ARKADE_REGTEST_RUN")
        .map(|value| value == "1")
        .unwrap_or(false)
}

fn regtest_endpoints() -> RegtestEndpoints {
    RegtestEndpoints {
        arkd_url: std::env::var("ARKADE_REGTEST_ARKD_URL")
            .unwrap_or_else(|_| DEFAULT_ARKD_URL.to_string()),
        esplora_url: std::env::var("ARKADE_REGTEST_ESPLORA_URL")
            .unwrap_or_else(|_| DEFAULT_ESPLORA_URL.to_string()),
        arkd_container: std::env::var("ARKD_REGTEST_CONTAINER")
            .unwrap_or_else(|_| DEFAULT_ARKD_CONTAINER.to_string()),
    }
}

fn repo_root() -> PathBuf {
    if let Ok(root) = std::env::var("BITBOARD_REPO_ROOT") {
        return PathBuf::from(root);
    }
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("repo root")
        .to_path_buf()
}

fn run_regtest_cli(args: &[&str]) {
    let regtest_cli = repo_root().join("regtest/regtest.mjs");
    let output = Command::new("node")
        .arg(&regtest_cli)
        .args(args)
        .current_dir(repo_root())
        .output()
        .unwrap_or_else(|error| panic!("failed to spawn regtest CLI {args:?}: {error}"));
    if !output.status.success() {
        panic!(
            "regtest CLI {:?} failed: {}",
            args,
            String::from_utf8_lossy(&output.stderr)
        );
    }
}

fn docker_command(args: &[&str]) {
    let output = Command::new("docker")
        .args(args)
        .output()
        .unwrap_or_else(|error| panic!("failed to run docker {args:?}: {error}"));
    if !output.status.success() {
        panic!(
            "docker {:?} failed: {}",
            args,
            String::from_utf8_lossy(&output.stderr)
        );
    }
}

fn docker_restart(container: &str) {
    docker_command(&["restart", container]);
}

fn docker_stop(container: &str) {
    docker_command(&["stop", container]);
}

fn docker_start(container: &str) {
    docker_command(&["start", container]);
}

fn fresh_test_mnemonic() -> String {
    let mut entropy = [0u8; 16];
    getrandom::getrandom(&mut entropy).expect("entropy");
    Mnemonic::from_entropy_in(Language::English, &entropy)
        .expect("mnemonic")
        .to_string()
}

fn fund_boarding_address(address: &str, sats: u64) {
    let btc = format!("{:.8}", sats as f64 / 100_000_000.0);
    run_regtest_cli(&["faucet", address, &btc, "--confirm"]);
}

fn rotate_signer_with_future_cutoff() {
    let cutoff = format!("+{}", 7 * 86_400);
    run_regtest_cli(&["rotate-signer", "--cutoff", &cutoff]);
}

fn pause_arkd_operator(endpoints: &RegtestEndpoints) {
    docker_stop(&endpoints.arkd_container);
}

struct ArkPauseGuard {
    arkd_container: String,
}

impl Drop for ArkPauseGuard {
    fn drop(&mut self) {
        docker_start(&self.arkd_container);
        std::thread::sleep(Duration::from_secs(8));
    }
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

#[derive(Debug, Deserialize)]
struct EsploraUtxo {
    value: u64,
    status: EsploraUtxoStatus,
}

#[derive(Debug, Deserialize)]
struct EsploraUtxoStatus {
    confirmed: bool,
}

async fn http_get_ok(url: &str) -> bool {
    reqwest::Client::new()
        .get(url)
        .send()
        .await
        .map(|response| response.status().is_success())
        .unwrap_or(false)
}

async fn wait_for_regtest_healthy(endpoints: &RegtestEndpoints) {
    let esplora_tip_url = format!(
        "{}/blocks/tip/height",
        endpoints.esplora_url.trim_end_matches('/')
    );
    let arkd_info_url = format!("{}/v1/info", endpoints.arkd_url.trim_end_matches('/'));
    let arkd_wallet_status_url = "http://localhost:7071/v1/admin/wallet/status".to_string();

    for _ in 0..90 {
        let esplora_ok = http_get_ok(&esplora_tip_url).await;
        let arkd_ok = http_get_ok(&arkd_info_url).await;
        let wallet_synced = http_get_ok(&arkd_wallet_status_url).await;
        if esplora_ok && arkd_ok && wallet_synced {
            return;
        }
        tokio::time::sleep(Duration::from_secs(2)).await;
    }
    panic!("arkade-regtest stack did not become healthy in time");
}

async fn restart_arkd_operator(endpoints: &RegtestEndpoints) {
    docker_restart(&endpoints.arkd_container);
    wait_for_regtest_healthy(endpoints).await;
}

async fn wait_for_confirmed_esplora_sats(esplora_url: &str, address: &str, min_sats: u64) {
    let client = reqwest::Client::new();
    let base = esplora_url.trim_end_matches('/');
    let deadline = std::time::Instant::now() + BOARDING_ESPLORA_CONFIRM_TIMEOUT;
    while std::time::Instant::now() < deadline {
        let url = format!("{base}/address/{address}/utxo");
        if let Ok(response) = client.get(&url).send().await {
            if response.status().is_success() {
                if let Ok(utxos) = response.json::<Vec<EsploraUtxo>>().await {
                    let confirmed_total = utxos
                        .iter()
                        .filter(|utxo| utxo.status.confirmed)
                        .map(|utxo| utxo.value)
                        .sum::<u64>();
                    if confirmed_total >= min_sats {
                        return;
                    }
                }
            }
        }
        tokio::time::sleep(Duration::from_millis(250)).await;
    }
    panic!("timeout waiting for confirmed boarding UTXOs at {address}");
}

async fn open_session(
    endpoints: &RegtestEndpoints,
    mnemonic: &str,
    persistence_json: Option<&str>,
) -> ArkSession {
    ArkSession::open(
        mnemonic,
        NetworkMode::Regtest,
        endpoints.arkd_url.clone(),
        String::new(),
        endpoints.esplora_url.clone(),
        persistence_json,
    )
    .await
    .expect("open session")
    .0
}

async fn board_wallet_to_arkade(session: &ArkSession, fund_started_at: std::time::Instant) {
    let cooperative_deadline = fund_started_at + BOARDING_COOPERATIVE_SETTLE_BUDGET;
    let mut last_error = String::from("boarding settle never attempted");

    while std::time::Instant::now() < cooperative_deadline {
        session
            .sync_with_operator()
            .await
            .expect("sync during boarding settle");
        let status = session.boarding_status().await.expect("boarding status");
        if status.spendable_sats < BOARD_SATS.saturating_sub(10_000) {
            tokio::time::sleep(Duration::from_millis(300)).await;
            continue;
        }

        match session.onboard_boarded_utxos().await {
            Ok(Some(_commitment_txid)) => return,
            Ok(None) => last_error = "onboard returned None".to_string(),
            Err(error) => last_error = error.to_string(),
        }
        eprintln!("onboard retry ({last_error})");
        tokio::time::sleep(Duration::from_millis(800)).await;
    }

    panic!(
        "boarding cooperative settle failed before deadline: {last_error}. \
         Try a clean regtest stack (`npm run regtest:clean-start` from frontend/) and rerun with --test-threads=1"
    );
}

async fn board_fresh_wallet(endpoints: &RegtestEndpoints) -> (ArkSession, String) {
    restart_arkd_operator(endpoints).await;

    let mnemonic = fresh_test_mnemonic();
    let session = open_session(endpoints, &mnemonic, None).await;
    session
        .sync_with_operator()
        .await
        .expect("initial operator sync");

    let boarding_address = session.boarding_address().expect("boarding address");
    let fund_started_at = std::time::Instant::now();
    fund_boarding_address(&boarding_address, BOARD_SATS);
    wait_for_confirmed_esplora_sats(&endpoints.esplora_url, &boarding_address, BOARD_SATS).await;
    board_wallet_to_arkade(&session, fund_started_at).await;

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
    let _regtest_lock = lock_regtest_suite();

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

    let _regtest_lock = lock_regtest_suite();
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
    let _regtest_lock = lock_regtest_suite();

    let endpoints = regtest_endpoints();
    let fixture = prepare_deprecated_signer_session_without_boarding(&endpoints).await;

    pause_arkd_operator(&endpoints);
    let _resume_arkd = ArkPauseGuard {
        arkd_container: endpoints.arkd_container.clone(),
    };

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
    let _regtest_lock = lock_regtest_suite();
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
