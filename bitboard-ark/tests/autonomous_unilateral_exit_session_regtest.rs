//! Prefetch exit materials during operator sync, then unroll + complete in autonomous mode
//! without calling `sync_with_operator` between unroll and complete.
//!
//! `ARKADE_REGTEST_RUN=1 cargo test -p bitboard-ark --test autonomous_unilateral_exit_session_regtest -- --ignored --nocapture`

#![cfg(not(target_arch = "wasm32"))]

use std::time::Duration;

use bitboard_ark::{CompleteUnilateralExitParams, VtxoOutpointDto};

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
#[ignore = "native regtest autonomous replay — ARKADE_REGTEST_RUN=1 cargo test -p bitboard-ark --test autonomous_unilateral_exit_session_regtest -- --ignored"]
async fn autonomous_unroll_and_complete_without_operator_sync() {
    if !regtest_enabled() {
        return;
    }

    let endpoints = regtest_endpoints();
    let session = prepare_funded_session().await;

    session
        .sync_with_operator()
        .await
        .expect("prefetch exit materials and cached operator info");

    let pre_status = session
        .autonomous_mode_status()
        .expect("autonomous status before enter");
    assert!(
        pre_status.cached_operator_info_present,
        "expected cached_operator_info after sync"
    );

    session
        .enter_autonomous_mode()
        .await
        .expect("enter autonomous mode");
    assert!(session.autonomous_mode_status().expect("status").active);

    let candidates = session
        .list_exit_candidates()
        .await
        .expect("autonomous exit candidates");
    let candidate = candidates
        .iter()
        .find(|row| row.can_start_unroll)
        .expect("at least one autonomous unroll-eligible VTXO with materials");

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

    session
        .run_unilateral_unroll(&candidate.txid, candidate.vout, |_| ())
        .await
        .expect("autonomous unilateral unroll");

    mine_blocks(UNILATERAL_EXIT_DELAY_BLOCKS + 5);

    let destination = session.boarding_address().expect("destination address");
    let completion_txid = session
        .complete_unilateral_exit(CompleteUnilateralExitParams {
            vtxo_outpoints: vec![VtxoOutpointDto {
                txid: candidate.txid.clone(),
                vout: candidate.vout,
            }],
            destination_address: destination,
            fee_rate_sat_per_vb: None,
        })
        .await
        .expect("autonomous complete unilateral exit");

    assert!(!completion_txid.is_empty(), "expected completion txid");

    session
        .exit_autonomous_mode()
        .await
        .expect("leave autonomous mode");
}
