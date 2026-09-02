//! Prefetch exit materials during operator sync, then unroll + complete in autonomous mode
//! without calling `sync_with_operator` between proceed-steps and complete.
//!
//! `ARKADE_REGTEST_RUN=1 cargo test -p bitboard-ark --test autonomous_unilateral_exit_session_regtest -- --ignored --nocapture`

#![cfg(not(target_arch = "wasm32"))]

use bitboard_ark::{
    CompleteUnilateralExitParams, ProceedUnilateralExitStepParams, UnilateralExitPhase,
    UnilateralExitProgressParams, UnilateralExitTopologyParams, VirtualOutPoint,
};

mod support;

use support::regtest_integration::{
    DEFAULT_BOARD_SATS, fund_bumper_wallet, mine_blocks, prepare_boarded_session, regtest_enabled,
    regtest_endpoints,
};

const BUMPER_SATS: u64 = 100_000;
const FEE_RATE_SAT_PER_VB: f64 = 2.0;
const UNILATERAL_EXIT_DELAY_BLOCKS: u32 = 20;
const UNILATERAL_EXIT_LEAF_CONFIRMATIONS: u32 = 6;
const MAX_PROCEED_STEPS: u32 = 24;

async fn prepare_funded_session() -> bitboard_ark::ArkSession {
    let endpoints = regtest_endpoints();
    prepare_boarded_session(&endpoints, DEFAULT_BOARD_SATS)
        .await
        .0
}

#[tokio::test]
#[ignore = "native regtest autonomous proceed+complete — ARKADE_REGTEST_RUN=1 cargo test -p bitboard-ark --test autonomous_unilateral_exit_session_regtest -- --ignored"]
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
    let startable_outpoints: Vec<VirtualOutPoint> = candidates
        .iter()
        .filter(|row| row.can_start_unroll)
        .map(|row| VirtualOutPoint::parse(&row.txid, row.vout).expect("candidate outpoint"))
        .collect();
    assert!(
        !startable_outpoints.is_empty(),
        "expected at least one autonomous unroll-eligible VTXO with materials"
    );

    let topology = session
        .get_unilateral_exit_topology(UnilateralExitTopologyParams {
            vtxo_outpoints: startable_outpoints,
        })
        .await
        .expect("unilateral exit topology");
    let batch_outpoints = topology.leaf_outpoints.clone();
    assert!(
        !batch_outpoints.is_empty(),
        "topology must expose terminal leaf outpoints"
    );

    fund_bumper_wallet(&session, &endpoints, BUMPER_SATS).await;

    let mut branch_complete = false;
    for _ in 0..MAX_PROCEED_STEPS {
        let proceed = session
            .proceed_unilateral_exit_step(ProceedUnilateralExitStepParams {
                vtxo_outpoints: batch_outpoints.clone(),
                fee_rate_sat_per_vb: FEE_RATE_SAT_PER_VB,
            })
            .await
            .expect("autonomous proceed step");
        if proceed.phase == UnilateralExitPhase::Complete {
            branch_complete = true;
            break;
        }
        mine_blocks(1);
    }
    assert!(
        branch_complete,
        "expected proceed-step loop to reach Complete within {MAX_PROCEED_STEPS} steps"
    );

    mine_blocks(UNILATERAL_EXIT_LEAF_CONFIRMATIONS);
    let progress = session
        .get_unilateral_exit_progress(UnilateralExitProgressParams {
            vtxo_outpoints: batch_outpoints.clone(),
        })
        .await
        .expect("progress after leaf confirmations");
    assert_eq!(
        progress.phase,
        UnilateralExitPhase::Complete,
        "progress should stay Complete after mining leaf confirmations"
    );

    mine_blocks(UNILATERAL_EXIT_DELAY_BLOCKS);

    let destination = session.boarding_address().expect("destination address");
    let completion_txid = session
        .complete_unilateral_exit(CompleteUnilateralExitParams {
            vtxo_outpoints: batch_outpoints,
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
