//! Shared helpers for native Arkade regtest integration tests (Docker + regtest.mjs + Esplora).

#![allow(dead_code)]

use std::path::PathBuf;
use std::process::Command;
use std::time::Duration;

use bip39::{Language, Mnemonic};
use bitboard_ark::{ArkSession, NetworkMode};
use serde::Deserialize;

pub const DEFAULT_ARKD_URL: &str = "http://localhost:7070";
pub const DEFAULT_ARKD_ADMIN_URL: &str = "http://localhost:7071";
pub const DEFAULT_ESPLORA_URL: &str = "http://localhost:7030/api";
pub const DEFAULT_ARKD_CONTAINER: &str = "bitboard-regtest-arkd";

pub const DEFAULT_BOARD_SATS: u64 = 200_000;
/// Matches E2E `BOARDING_COOPERATIVE_SETTLE_BUDGET_MS` — fund → settle must finish inside arkd's ~30s window.
pub const BOARDING_COOPERATIVE_SETTLE_BUDGET: Duration = Duration::from_secs(25);
pub const BOARDING_ESPLORA_CONFIRM_TIMEOUT: Duration = Duration::from_secs(20);

pub struct RegtestEndpoints {
    pub arkd_url: String,
    pub arkd_admin_url: String,
    pub esplora_url: String,
    pub arkd_container: String,
}

/// Matches `scripts/arkade-regtest-health.mjs` (`ARKD_ADMIN_REGTEST_URL` + `/v1/admin/wallet/status`).
pub fn arkd_admin_wallet_status_url(arkd_admin_url: &str) -> String {
    format!(
        "{}/v1/admin/wallet/status",
        arkd_admin_url.trim_end_matches('/')
    )
}

pub fn regtest_enabled() -> bool {
    std::env::var("ARKADE_REGTEST_RUN")
        .map(|value| value == "1")
        .unwrap_or(false)
}

pub fn regtest_endpoints() -> RegtestEndpoints {
    RegtestEndpoints {
        arkd_url: std::env::var("ARKADE_REGTEST_ARKD_URL")
            .unwrap_or_else(|_| DEFAULT_ARKD_URL.to_string()),
        arkd_admin_url: std::env::var("ARKD_ADMIN_REGTEST_URL")
            .unwrap_or_else(|_| DEFAULT_ARKD_ADMIN_URL.to_string()),
        esplora_url: std::env::var("ARKADE_REGTEST_ESPLORA_URL")
            .unwrap_or_else(|_| DEFAULT_ESPLORA_URL.to_string()),
        arkd_container: std::env::var("ARKD_REGTEST_CONTAINER")
            .unwrap_or_else(|_| DEFAULT_ARKD_CONTAINER.to_string()),
    }
}

pub fn repo_root() -> PathBuf {
    if let Ok(root) = std::env::var("BITBOARD_REPO_ROOT") {
        return PathBuf::from(root);
    }
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("repo root")
        .to_path_buf()
}

/// Default E2E export path (`ARKADE_REGTEST_EXPORT_BOARDED_FIXTURE=1` from `frontend/`).
pub const DEFAULT_BOARDED_FIXTURE_RELATIVE: &str =
    "frontend/test-results/arkade-boarded-fixture.json";

/// Resolve a fixture path from `ARKADE_REGTEST_BOARDED_FIXTURE`.
///
/// `cargo test -p bitboard-ark` runs with cwd `bitboard-ark/`, so repo-relative paths like
/// `frontend/test-results/arkade-boarded-fixture.json` must be anchored at the repo root.
pub fn resolve_regtest_fixture_path(path: &str) -> PathBuf {
    let path_buf = PathBuf::from(path);
    if path_buf.is_absolute() {
        return path_buf;
    }
    if let Ok(cwd) = std::env::current_dir() {
        let from_cwd = cwd.join(&path_buf);
        if from_cwd.is_file() {
            return from_cwd;
        }
    }
    repo_root().join(&path_buf)
}

pub fn run_regtest_cli(args: &[&str]) {
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

pub fn docker_command(args: &[&str]) {
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

pub fn docker_restart(container: &str) {
    docker_command(&["restart", container]);
}

pub fn docker_stop(container: &str) {
    docker_command(&["stop", container]);
}

pub fn docker_start(container: &str) {
    docker_command(&["start", container]);
}

pub fn fresh_test_mnemonic() -> String {
    let mut entropy = [0u8; 16];
    getrandom::getrandom(&mut entropy).expect("entropy");
    Mnemonic::from_entropy_in(Language::English, &entropy)
        .expect("mnemonic")
        .to_string()
}

pub fn fund_regtest_address(address: &str, sats: u64) {
    let btc = format!("{:.8}", sats as f64 / 100_000_000.0);
    run_regtest_cli(&["faucet", address, &btc, "--confirm"]);
}

pub fn mine_blocks(count: u32) {
    run_regtest_cli(&["mine", &count.to_string()]);
}

pub fn rotate_signer_with_future_cutoff() {
    let cutoff = format!("+{}", 7 * 86_400);
    run_regtest_cli(&["rotate-signer", "--cutoff", &cutoff]);
}

pub struct ArkPauseGuard {
    arkd_container: String,
}

impl ArkPauseGuard {
    pub fn pause_arkd_operator(endpoints: &RegtestEndpoints) -> Self {
        docker_stop(&endpoints.arkd_container);
        Self {
            arkd_container: endpoints.arkd_container.clone(),
        }
    }
}

impl Drop for ArkPauseGuard {
    fn drop(&mut self) {
        docker_start(&self.arkd_container);
        std::thread::sleep(Duration::from_secs(8));
    }
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

pub async fn wait_for_regtest_healthy(endpoints: &RegtestEndpoints) {
    let esplora_tip_url = format!(
        "{}/blocks/tip/height",
        endpoints.esplora_url.trim_end_matches('/')
    );
    let arkd_info_url = format!("{}/v1/info", endpoints.arkd_url.trim_end_matches('/'));
    let arkd_wallet_status_url = arkd_admin_wallet_status_url(&endpoints.arkd_admin_url);

    for _ in 0..90 {
        let esplora_ok = http_get_ok(&esplora_tip_url).await;
        let arkd_ok = http_get_ok(&arkd_info_url).await;
        let wallet_synced = http_get_ok(&arkd_wallet_status_url).await;
        if esplora_ok && arkd_ok && wallet_synced {
            return;
        }
        tokio::time::sleep(Duration::from_secs(2)).await;
    }
    panic!(
        "arkade-regtest stack did not become healthy in time (arkd admin wallet status: {arkd_wallet_status_url})"
    );
}

pub async fn restart_arkd_operator(endpoints: &RegtestEndpoints) {
    docker_restart(&endpoints.arkd_container);
    wait_for_regtest_healthy(endpoints).await;
}

pub async fn wait_for_confirmed_esplora_sats(esplora_url: &str, address: &str, min_sats: u64) {
    let client = reqwest::Client::new();
    let base = esplora_url.trim_end_matches('/');
    let deadline = std::time::Instant::now() + BOARDING_ESPLORA_CONFIRM_TIMEOUT;
    while std::time::Instant::now() < deadline {
        let url = format!("{base}/address/{address}/utxo");
        if let Ok(response) = client.get(&url).send().await
            && response.status().is_success()
            && let Ok(utxos) = response.json::<Vec<EsploraUtxo>>().await
        {
            let confirmed_total = utxos
                .iter()
                .filter(|utxo| utxo.status.confirmed)
                .map(|utxo| utxo.value)
                .sum::<u64>();
            if confirmed_total >= min_sats {
                return;
            }
        }
        tokio::time::sleep(Duration::from_millis(250)).await;
    }
    panic!("timeout waiting for confirmed UTXOs at {address}");
}

pub async fn open_session(
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

fn boarding_settle_error_must_not_retry(error_message: &str) -> bool {
    // `settle_vtxos` / `join_next_batch` registers an intent before the round completes.
    // Retrying after a mid-round client or operator failure re-registers inputs and wedges arkd
    // (`duplicated input`, `not a wallet script`, `not enough intent confirmations`).
    error_message.contains("Failed to join batch") || error_message.contains("batch failed")
}

pub async fn board_wallet_to_arkade(
    session: &ArkSession,
    fund_started_at: std::time::Instant,
    board_sats: u64,
) {
    let cooperative_deadline = fund_started_at + BOARDING_COOPERATIVE_SETTLE_BUDGET;
    let mut last_error = String::from("boarding settle never attempted");

    while std::time::Instant::now() < cooperative_deadline {
        session
            .sync_with_operator()
            .await
            .expect("sync during boarding settle");
        let status = session.boarding_status().await.expect("boarding status");
        if status.spendable_sats < board_sats.saturating_sub(10_000) {
            tokio::time::sleep(Duration::from_millis(300)).await;
            continue;
        }

        match session.onboard_boarded_utxos().await {
            Ok(Some(_commitment_txid)) => return,
            Ok(None) => last_error = "onboard returned None".to_string(),
            Err(error) => {
                let error_message = error.to_string();
                if boarding_settle_error_must_not_retry(&error_message) {
                    panic!(
                        "boarding cooperative settle failed with non-retryable batch error: \
                         {error_message}. Do not retry `join_next_batch` after this — run \
                         `ARKD_VTXO_TREE_EXPIRY=200 npm run regtest:clean-start` from frontend/ \
                         and rerun with --test-threads=1"
                    );
                }
                last_error = error_message;
            }
        }
        eprintln!("onboard retry ({last_error})");
        tokio::time::sleep(Duration::from_millis(800)).await;
    }

    panic!(
        "boarding cooperative settle failed before deadline: {last_error}. \
         Try a clean regtest stack (`npm run regtest:clean-start` from frontend/) and rerun with --test-threads=1"
    );
}

pub async fn fund_and_board_wallet(
    endpoints: &RegtestEndpoints,
    session: &ArkSession,
    board_sats: u64,
) {
    let boarding_address = session.boarding_address().expect("boarding address");
    let fund_started_at = std::time::Instant::now();
    fund_regtest_address(&boarding_address, board_sats);
    wait_for_confirmed_esplora_sats(&endpoints.esplora_url, &boarding_address, board_sats).await;
    board_wallet_to_arkade(session, fund_started_at, board_sats).await;
}

/// Open a fresh wallet, fund the boarding address, and cooperatively settle on the **current**
/// regtest stack.
///
/// Restarts `arkd` first (same isolation as serial E2E `@arkade-regtest` `beforeEach`). Call after
/// a clean stack boot (`ARKD_VTXO_TREE_EXPIRY=200 npm run regtest:clean-start` from `frontend/`
/// for boarding-heavy flows).
pub async fn prepare_boarded_session(
    endpoints: &RegtestEndpoints,
    board_sats: u64,
) -> (ArkSession, String) {
    restart_arkd_operator(endpoints).await;
    wait_for_regtest_healthy(endpoints).await;

    let mnemonic = fresh_test_mnemonic();
    let session = open_session(endpoints, &mnemonic, None).await;
    session
        .sync_with_operator()
        .await
        .expect("initial operator sync");

    fund_and_board_wallet(endpoints, &session, board_sats).await;

    mine_blocks(1);
    session.sync_with_operator().await.expect("post-board sync");
    let balance_after_board = session.balance().await.expect("balance after board");
    assert!(
        balance_after_board.offchain_spendable_sats > 0 || balance_after_board.confirmed_sats > 0,
        "expected Arkade balance after boarding"
    );

    (session, mnemonic)
}
