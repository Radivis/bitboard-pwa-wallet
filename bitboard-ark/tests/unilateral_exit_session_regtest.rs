//! Full unilateral unroll + complete against live arkade-regtest.
//!
//! `ARKADE_REGTEST_RUN=1 cargo test -p bitboard-ark --test unilateral_exit_session_regtest -- --ignored --nocapture`

#![cfg(not(target_arch = "wasm32"))]

use std::time::Duration;

use bitboard_ark::CompleteUnilateralExitParams;

mod support;

use support::regtest_integration::{
    DEFAULT_BOARD_SATS, fund_regtest_address, mine_blocks, prepare_boarded_session,
    regtest_enabled, regtest_endpoints, wait_for_confirmed_esplora_sats,
};

const BUMPER_SATS: u64 = 100_000;
const UNILATERAL_EXIT_DELAY_BLOCKS: u32 = 20;

async fn prepare_funded_session() -> bitboard_ark::ArkSession {
    let endpoints = regtest_endpoints();
    prepare_boarded_session(&endpoints, DEFAULT_BOARD_SATS)
        .await
        .0
}

#[tokio::test]
#[ignore = "full native boarding+complete on live regtest — run after `ARKD_VTXO_TREE_EXPIRY=200 npm run regtest:clean-start`; E2E REG-04 is the primary lock-in. ARKADE_REGTEST_RUN=1 cargo test -p bitboard-ark --test unilateral_exit_session_regtest -- --ignored"]
async fn unilateral_unroll_and_complete_on_regtest() {
    if !regtest_enabled() {
        return;
    }

    let endpoints = regtest_endpoints();
    let session = prepare_funded_session().await;

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
    wait_for_confirmed_esplora_sats(&endpoints.esplora_url, &bumper.address, BUMPER_SATS).await;
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
            fee_rate_sat_per_vb: None,
        })
        .await
        .expect("complete unilateral exit");

    assert!(!completion_txid.is_empty(), "expected completion txid");
}
