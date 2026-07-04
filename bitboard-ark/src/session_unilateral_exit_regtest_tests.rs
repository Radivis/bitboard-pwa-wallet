//! Full unilateral unroll + complete against live arkade-regtest.
//!
//! `ARKADE_REGTEST_RUN=1 cargo test -p bitboard-ark unilateral_unroll_and_complete_on_regtest -- --ignored --nocapture`

#![cfg(all(test, not(target_arch = "wasm32")))]

use std::path::PathBuf;
use std::process::Command;
use std::time::Duration;

use bip39::{Language, Mnemonic};

use crate::api_types::CompleteUnilateralExitParams;
use crate::{ArkSession, NetworkMode};

const DEFAULT_ARKD_URL: &str = "http://localhost:7070";
const DEFAULT_ESPLORA_URL: &str = "http://localhost:7030/api";
const DEFAULT_ARKD_CONTAINER: &str = "bitboard-regtest-arkd";
const BOARD_SATS: u64 = 200_000;
const BUMPER_SATS: u64 = 100_000;
const UNILATERAL_EXIT_DELAY_BLOCKS: u32 = 20;
const COMMITMENT_CONFIRM_BLOCKS: u32 = 1;
const BOARDING_COOPERATIVE_SETTLE_BUDGET: Duration = Duration::from_secs(25);
const BOARDING_ESPLORA_CONFIRM_TIMEOUT: Duration = Duration::from_secs(20);

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

fn fresh_test_mnemonic() -> String {
    let mut entropy = [0u8; 16];
    getrandom::getrandom(&mut entropy).expect("entropy");
    Mnemonic::from_entropy_in(Language::English, &entropy)
        .expect("mnemonic")
        .to_string()
}

fn fund_regtest_address(address: &str, sats: u64) {
    let btc = format!("{:.8}", sats as f64 / 100_000_000.0);
    run_regtest_cli(&["faucet", address, &btc, "--confirm"]);
}

fn mine_blocks(count: u32) {
    run_regtest_cli(&["mine", &count.to_string()]);
}

#[derive(Debug, serde::Deserialize)]
struct EsploraUtxo {
    value: u64,
    status: EsploraUtxoStatus,
}

#[derive(Debug, serde::Deserialize)]
struct EsploraUtxoStatus {
    confirmed: bool,
}

async fn wait_for_confirmed_esplora_sats(esplora_url: &str, address: &str, min_sats: u64) {
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

async fn wait_for_regtest_healthy(arkd_url: &str, esplora_url: &str) {
    let client = reqwest::Client::new();
    let esplora_tip_url = format!("{}/blocks/tip/height", esplora_url.trim_end_matches('/'));
    let arkd_info_url = format!("{}/v1/info", arkd_url.trim_end_matches('/'));
    let arkd_wallet_status_url = "http://localhost:7071/v1/admin/wallet/status";

    for _ in 0..90 {
        let esplora_ok = client
            .get(&esplora_tip_url)
            .send()
            .await
            .map(|response| response.status().is_success())
            .unwrap_or(false);
        let arkd_ok = client
            .get(&arkd_info_url)
            .send()
            .await
            .map(|response| response.status().is_success())
            .unwrap_or(false);
        let wallet_synced = client
            .get(arkd_wallet_status_url)
            .send()
            .await
            .map(|response| response.status().is_success())
            .unwrap_or(false);
        if esplora_ok && arkd_ok && wallet_synced {
            return;
        }
        tokio::time::sleep(Duration::from_secs(2)).await;
    }
    panic!("arkade-regtest stack did not become healthy in time");
}

#[allow(dead_code)]
async fn restart_arkd_operator(arkd_url: &str, esplora_url: &str) {
    docker_restart(DEFAULT_ARKD_CONTAINER);
    wait_for_regtest_healthy(arkd_url, esplora_url).await;
}

async fn open_session(arkd_url: &str, esplora_url: &str, mnemonic: &str) -> ArkSession {
    ArkSession::open(
        mnemonic,
        NetworkMode::Regtest,
        arkd_url.to_string(),
        String::new(),
        esplora_url.to_string(),
        None,
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
        tokio::time::sleep(Duration::from_millis(800)).await;
    }

    panic!("boarding cooperative settle failed before deadline: {last_error}");
}

async fn prepare_funded_session(arkd_url: &str, esplora_url: &str) -> ArkSession {
    // Do not restart arkd here — same as the isolated REG-04 E2E spec. Restarting mid-stack
    // after other regtest tests can leave poisoned batch state; boot a clean stack first
    // (`npm run regtest:clean-start` with ARKD_VTXO_TREE_EXPIRY=200).
    wait_for_regtest_healthy(arkd_url, esplora_url).await;

    let mnemonic = fresh_test_mnemonic();
    let session = open_session(arkd_url, esplora_url, &mnemonic).await;
    session
        .sync_with_operator()
        .await
        .expect("initial operator sync");

    let boarding_address = session.boarding_address().expect("boarding address");
    let fund_started_at = std::time::Instant::now();
    fund_regtest_address(&boarding_address, BOARD_SATS);
    wait_for_confirmed_esplora_sats(esplora_url, &boarding_address, BOARD_SATS).await;
    board_wallet_to_arkade(&session, fund_started_at).await;

    mine_blocks(COMMITMENT_CONFIRM_BLOCKS);
    session.sync_with_operator().await.expect("post-board sync");
    session
}

fn regtest_enabled() -> bool {
    std::env::var("ARKADE_REGTEST_RUN")
        .map(|value| value == "1")
        .unwrap_or(false)
}

#[tokio::test]
#[ignore = "full native boarding+complete on live regtest — run after `ARKD_VTXO_TREE_EXPIRY=200 npm run regtest:clean-start`; E2E REG-04 is the primary lock-in. ARKADE_REGTEST_RUN=1 cargo test -p bitboard-ark unilateral_unroll_and_complete_on_regtest -- --ignored"]
async fn unilateral_unroll_and_complete_on_regtest() {
    if !regtest_enabled() {
        return;
    }

    let arkd_url =
        std::env::var("ARKADE_REGTEST_ARKD_URL").unwrap_or_else(|_| DEFAULT_ARKD_URL.to_string());
    let esplora_url = std::env::var("ARKADE_REGTEST_ESPLORA_URL")
        .unwrap_or_else(|_| DEFAULT_ESPLORA_URL.to_string());

    let session = prepare_funded_session(&arkd_url, &esplora_url).await;

    let candidates = session
        .list_exit_candidates()
        .await
        .expect("exit candidates");
    let candidate = candidates
        .iter()
        .find(|row| row.can_start_unroll)
        .expect("at least one unroll-eligible VTXO");

    let bumper = session.onchain_bumper_info().await.expect("bumper info");
    fund_regtest_address(&bumper.address, BUMPER_SATS);
    wait_for_confirmed_esplora_sats(&esplora_url, &bumper.address, BUMPER_SATS).await;
    let bumper_deadline = std::time::Instant::now() + Duration::from_secs(30);
    while std::time::Instant::now() < bumper_deadline {
        let refreshed = session.onchain_bumper_info().await.expect("bumper re-sync");
        if refreshed.balance_sats >= BUMPER_SATS.saturating_sub(1_000) {
            break;
        }
        tokio::time::sleep(Duration::from_millis(500)).await;
    }
    let refreshed = session
        .onchain_bumper_info()
        .await
        .expect("bumper balance check");
    assert!(
        refreshed.balance_sats >= BUMPER_SATS.saturating_sub(1_000),
        "bumper wallet not funded: {} sats",
        refreshed.balance_sats
    );

    session
        .run_unilateral_unroll(&candidate.txid, candidate.vout, |_| ())
        .await
        .expect("unilateral unroll");

    mine_blocks(UNILATERAL_EXIT_DELAY_BLOCKS + 5);
    session
        .sync_with_operator()
        .await
        .expect("pre-complete sync");

    let destination = session.boarding_address().expect("destination address");
    let completion_txid = session
        .complete_unilateral_exit(CompleteUnilateralExitParams {
            vtxo_txids: vec![candidate.txid.clone()],
            destination_address: destination,
        })
        .await
        .expect("complete unilateral exit");

    assert!(!completion_txid.is_empty(), "expected completion txid");
}
