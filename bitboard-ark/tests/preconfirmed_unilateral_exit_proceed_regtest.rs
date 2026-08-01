//! REG-07 broadcast path: `proceed_unilateral_exit_step` must relay the first branch tx for
//! chained preconfirmed multi-leaf trees (not only the E2E automation runner).
//!
//! `ARKADE_REGTEST_RUN=1 cargo test -p bitboard-ark --test preconfirmed_unilateral_exit_proceed_regtest -- --ignored --nocapture --test-threads=1`

#![cfg(not(target_arch = "wasm32"))]

use std::time::Duration;

use bitboard_ark::{
    ProceedUnilateralExitStepParams, UnilateralExitBatchEstimateParams, UnilateralExitPhase,
    UnilateralExitProgressParams, UnilateralExitTopologyParams, VirtualOutPoint,
};
use bitcoin::Transaction;
use bitcoin::consensus::deserialize;

mod support;

use support::regtest_integration::{
    DEFAULT_BOARD_SATS, esplora_tx_endpoint_status, fund_bumper_wallet, mine_blocks,
    prepare_chained_preconfirmed_session, regtest_enabled, regtest_endpoints,
    wait_for_esplora_tx_raw,
};

const BUMPER_SATS: u64 = 1_000_000;
const FEE_RATE_SAT_PER_VB: f64 = 2.0;
const ESPLORA_RELAY_TIMEOUT: Duration = Duration::from_secs(45);
const VTXO_STATUS_PRECONFIRMED: &str = "preconfirmed";

async fn esplora_tx_diagnostics(esplora_url: &str, txid: &str) -> String {
    let json_status = esplora_tx_endpoint_status(esplora_url, txid, "").await;
    let raw_status = esplora_tx_endpoint_status(esplora_url, txid, "/raw").await;
    let status_status = esplora_tx_endpoint_status(esplora_url, txid, "/status").await;
    format!("txid={txid} json={json_status} raw={raw_status} status={status_status}")
}

async fn esplora_post_package_broadcast_error(esplora_url: &str, tx_hexes: &[&str]) -> String {
    let client = reqwest::Client::new();
    let url = format!(
        "{}/txs/package?maxfeerate=0&maxburnamount=0",
        esplora_url.trim_end_matches('/')
    );
    let body = serde_json::to_string(tx_hexes).unwrap_or_default();
    let response = client
        .post(url)
        .header("content-type", "application/json")
        .body(body.to_string())
        .send()
        .await;
    match response {
        Ok(response) => {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            format!("status={status} body={text}")
        }
        Err(error) => format!("request_error={error}"),
    }
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

    let topology_for_debug = session
        .get_unilateral_exit_topology(UnilateralExitTopologyParams {
            vtxo_outpoints: startable_outpoints.clone(),
        })
        .await
        .expect("topology before proceed debug");
    eprintln!(
        "REG-07 debug: exit_branch_txids={:?}",
        topology_for_debug.exit_branch_txids
    );
    if let Some(first_txid) = topology_for_debug.exit_branch_txids.first() {
        eprintln!(
            "REG-07 debug: first_step_esplora={}",
            esplora_tx_diagnostics(&endpoints.esplora_url, first_txid).await
        );
    }
    let parent_hex = session
        .export_unilateral_exit_step_parent_hex(
            UnilateralExitBatchEstimateParams {
                vtxo_outpoints: batch_outpoints.clone(),
                fee_rate_sat_per_vb: Some(FEE_RATE_SAT_PER_VB),
            },
            0,
        )
        .await
        .expect("parent tx hex");
    let parent_tx: Transaction =
        deserialize(&hex::decode(parent_hex.trim()).expect("parent hex decode"))
            .expect("parent tx");
    for (index, input) in parent_tx.input.iter().enumerate() {
        let prev_txid = input.previous_output.txid.to_string();
        eprintln!(
            "REG-07 debug: parent_input[{index}]={prev_txid}:{} esplora={}",
            input.previous_output.vout,
            esplora_tx_diagnostics(&endpoints.esplora_url, &prev_txid).await
        );
    }
    eprintln!(
        "REG-07 debug: parent_only_package_broadcast_error={}",
        esplora_post_package_broadcast_error(&endpoints.esplora_url, &[parent_hex.as_str()]).await
    );
    let package_hex = session
        .export_unilateral_exit_step_package_hex(
            UnilateralExitBatchEstimateParams {
                vtxo_outpoints: batch_outpoints.clone(),
                fee_rate_sat_per_vb: Some(FEE_RATE_SAT_PER_VB),
            },
            0,
        )
        .await
        .expect("package hex");
    eprintln!(
        "REG-07 debug: parent_child_package_broadcast_error={}",
        esplora_post_package_broadcast_error(
            &endpoints.esplora_url,
            &[package_hex[0].as_str(), package_hex[1].as_str()],
        )
        .await
    );

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

    let relayed = wait_for_esplora_tx_raw(
        &endpoints.esplora_url,
        &first_step_txid,
        ESPLORA_RELAY_TIMEOUT,
    )
    .await;
    if !relayed {
        let mut diagnostics =
            vec![esplora_tx_diagnostics(&endpoints.esplora_url, &first_step_txid).await];
        for txid in topology.exit_branch_txids.iter().take(3) {
            diagnostics.push(esplora_tx_diagnostics(&endpoints.esplora_url, txid).await);
        }
        panic!(
            "first unilateral exit step tx was not relayed on Esplora /raw within {:?}: {}",
            ESPLORA_RELAY_TIMEOUT,
            diagnostics.join("; ")
        );
    }

    mine_blocks(1);
    session
        .sync_with_operator()
        .await
        .expect("sync after mining first step");

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
