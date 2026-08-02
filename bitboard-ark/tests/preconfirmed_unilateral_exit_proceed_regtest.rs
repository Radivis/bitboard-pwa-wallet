//! REG-07 broadcast path: `proceed_unilateral_exit_step` must relay the first branch tx for
//! chained preconfirmed multi-leaf trees (not only the E2E automation runner).
//!
//! `ARKADE_REGTEST_RUN=1 cargo test -p bitboard-ark --test preconfirmed_unilateral_exit_proceed_regtest -- --ignored --nocapture --test-threads=1`

#![cfg(not(target_arch = "wasm32"))]

use bitboard_ark::{
    ProceedUnilateralExitStepParams, UnilateralExitBatchEstimateParams, UnilateralExitPhase,
    UnilateralExitProgressParams, UnilateralExitTopologyParams, VirtualOutPoint,
};

mod support;

use support::regtest_integration::{
    DEFAULT_BOARD_SATS, esplora_tx_endpoint_status, fund_bumper_wallet, mine_blocks,
    prepare_chained_preconfirmed_session, regtest_enabled, regtest_endpoints,
};

const BUMPER_SATS: u64 = 10_000;
const FEE_RATE_SAT_PER_VB: f64 = 2.0;
const VTXO_STATUS_PRECONFIRMED: &str = "preconfirmed";

async fn esplora_tx_diagnostics(esplora_url: &str, txid: &str) -> String {
    let json_status = esplora_tx_endpoint_status(esplora_url, txid, "").await;
    let raw_status = esplora_tx_endpoint_status(esplora_url, txid, "/raw").await;
    let status_status = esplora_tx_endpoint_status(esplora_url, txid, "/status").await;
    format!("txid={txid} json={json_status} raw={raw_status} status={status_status}")
}

#[tokio::test]
#[ignore = "chained preconfirmed proceed+broadcast on live regtest — run after `ARKD_VTXO_TREE_EXPIRY=200 npm run regtest:clean-start`; complements E2E-ARK-REG-07. ARKADE_REGTEST_RUN=1 cargo test -p bitboard-ark --test preconfirmed_unilateral_exit_proceed_regtest -- --ignored --nocapture --test-threads=1"]
async fn chained_preconfirmed_proceed_relays_first_step_tx_on_regtest() {
    if !regtest_enabled() {
        return;
    }

    let endpoints = regtest_endpoints();
    let session = prepare_chained_preconfirmed_session(&endpoints, DEFAULT_BOARD_SATS).await;

    let candidates = session
        .list_exit_candidates()
        .await
        .expect("exit candidates after chained self-send");
    let startable_outpoints: Vec<VirtualOutPoint> = candidates
        .iter()
        .filter(|row| row.can_start_unroll)
        .map(|row| VirtualOutPoint::parse(&row.txid, row.vout).expect("candidate outpoint"))
        .collect();
    assert!(
        !startable_outpoints.is_empty(),
        "expected at least one terminal leaf exit candidate"
    );

    let preconfirmed_startable_count = candidates
        .iter()
        .filter(|row| row.can_start_unroll && row.virtual_status_state == VTXO_STATUS_PRECONFIRMED)
        .count();

    let topology = session
        .get_unilateral_exit_topology(UnilateralExitTopologyParams {
            vtxo_outpoints: startable_outpoints.clone(),
        })
        .await
        .expect("unilateral exit topology");
    let batch_outpoints = topology.leaf_outpoints.clone();
    assert!(
        !batch_outpoints.is_empty(),
        "topology must expose terminal leaf outpoints"
    );
    assert!(
        topology.host_outpoints.len() > batch_outpoints.len() || topology.nodes.len() >= 3,
        "expected chained REG-07-style topology (nodes={}, host_outpoints={}, terminal_leaves={}, preconfirmed_startable={})",
        topology.nodes.len(),
        topology.host_outpoints.len(),
        batch_outpoints.len(),
        preconfirmed_startable_count,
    );
    assert!(
        topology.exit_branch_txids.len() >= 2,
        "expected a multi-step unroll branch, got {} step txids",
        topology.exit_branch_txids.len()
    );

    let estimate = session
        .estimate_unilateral_exit_batch(UnilateralExitBatchEstimateParams {
            vtxo_outpoints: batch_outpoints.clone(),
            fee_rate_sat_per_vb: Some(FEE_RATE_SAT_PER_VB),
        })
        .await
        .expect("batch fee estimate");
    assert!(
        estimate.estimate_error.is_none(),
        "batch estimate error: {:?}",
        estimate.estimate_error
    );
    assert!(
        estimate.projected_unroll_steps >= 2,
        "expected multi-step batch, got {} projected steps",
        estimate.projected_unroll_steps
    );

    fund_bumper_wallet(&session, &endpoints, BUMPER_SATS).await;

    let estimate_after_fund = session
        .estimate_unilateral_exit_batch(UnilateralExitBatchEstimateParams {
            vtxo_outpoints: batch_outpoints.clone(),
            fee_rate_sat_per_vb: Some(FEE_RATE_SAT_PER_VB),
        })
        .await
        .expect("batch fee estimate after bumper fund");
    assert!(
        estimate_after_fund.bumper_sufficient,
        "bumper insufficient for first step: balance={} estimated_package_fee_sats={}",
        estimate_after_fund.bumper_balance_sats, estimate_after_fund.estimated_package_fee_sats
    );

    let proceed = match session
        .proceed_unilateral_exit_step(ProceedUnilateralExitStepParams {
            vtxo_outpoints: batch_outpoints.clone(),
            fee_rate_sat_per_vb: FEE_RATE_SAT_PER_VB,
        })
        .await
    {
        Ok(result) => result,
        Err(error) => {
            let mut diagnostics = Vec::new();
            for txid in topology.exit_branch_txids.iter().take(3) {
                diagnostics.push(esplora_tx_diagnostics(&endpoints.esplora_url, txid).await);
            }
            panic!(
                "proceed_unilateral_exit_step failed (REG-07 broadcast path): {error}; {}",
                diagnostics.join("; ")
            );
        }
    };

    assert_eq!(proceed.step_index, 0, "first proceed should target step 0");
    assert!(
        proceed.total_steps >= 2,
        "expected multi-step branch, got total_steps={}",
        proceed.total_steps
    );
    assert_eq!(
        proceed.phase,
        UnilateralExitPhase::Waiting,
        "first proceed should enter waiting for confirmation"
    );

    let first_step_txid = proceed
        .step_txid
        .clone()
        .or_else(|| topology.exit_branch_txids.first().cloned())
        .expect("first step txid from proceed or topology");

    // esplora_gateway serves `/raw` from bitcoind after package broadcast (REG-07 contract).
    let raw_after_proceed =
        esplora_tx_endpoint_status(&endpoints.esplora_url, &first_step_txid, "/raw").await;
    assert_eq!(
        raw_after_proceed,
        200,
        "expected first step tx on Esplora /raw after proceed (mempool relay); {}",
        esplora_tx_diagnostics(&endpoints.esplora_url, &first_step_txid).await
    );

    mine_blocks(1);

    let progress = session
        .get_unilateral_exit_progress(UnilateralExitProgressParams {
            vtxo_outpoints: batch_outpoints,
        })
        .await
        .expect("progress after first step mined");

    assert!(
        progress.step_index >= 1 || progress.phase == UnilateralExitPhase::Complete,
        "expected step index to advance after mining first branch tx, got step {}/{} phase {:?}",
        progress.step_index,
        progress.total_steps,
        progress.phase
    );
}
