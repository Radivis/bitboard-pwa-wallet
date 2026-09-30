//! REG-07 broadcast path: `proceed_unilateral_exit_step` must relay the first branch tx for
//! chained preconfirmed multi-leaf trees (not only the E2E automation runner).
//! The reorg test orphans the first confirmation of a settled exit-host leaf without re-mining it.
//!
//! `ARKADE_REGTEST_RUN=1 cargo test -p bitboard-ark --test preconfirmed_unilateral_exit_proceed_regtest -- --ignored --nocapture --test-threads=1`

#![cfg(not(target_arch = "wasm32"))]

use bitboard_ark::{
    ArkSession, ProceedUnilateralExitStepParams, UnilateralExitBatchEstimateParams,
    UnilateralExitJobViabilityKind, UnilateralExitPhase, UnilateralExitProgressParams,
    UnilateralExitTopologyParams, VirtualOutPoint, VtxoExitPhase,
};

mod support;

use std::time::{Duration, Instant};

use support::regtest_integration::{
    DEFAULT_BOARD_SATS, RegtestEndpoints, bitcoin_cli_stdout, esplora_tx_endpoint_status,
    fund_bumper_wallet, mine_blocks, prepare_boarded_session, prepare_chained_preconfirmed_session,
    regtest_enabled, regtest_endpoints, run_regtest_cli,
};

const BUMPER_SATS: u64 = 10_000;
const FEE_RATE_SAT_PER_VB: f64 = 2.0;
const VTXO_STATUS_PRECONFIRMED: &str = "preconfirmed";
const CHAIN_VISIBILITY_TIMEOUT: Duration = Duration::from_secs(20);

struct FirstChainedStep {
    session: ArkSession,
    esplora_url: String,
    batch_outpoints: Vec<VirtualOutPoint>,
    first_step_txid: String,
}

#[derive(serde::Deserialize)]
struct EsploraTxStatusBody {
    confirmed: bool,
}

async fn esplora_tx_diagnostics(esplora_url: &str, txid: &str) -> String {
    let json_status = esplora_tx_endpoint_status(esplora_url, txid, "").await;
    let raw_status = esplora_tx_endpoint_status(esplora_url, txid, "/raw").await;
    let status_status = esplora_tx_endpoint_status(esplora_url, txid, "/status").await;
    format!("txid={txid} json={json_status} raw={raw_status} status={status_status}")
}

async fn esplora_text(esplora_url: &str, path: &str) -> String {
    let url = format!(
        "{}/{}",
        esplora_url.trim_end_matches('/'),
        path.trim_start_matches('/')
    );
    let Ok(response) = reqwest::Client::new().get(url).send().await else {
        return String::new();
    };
    if !response.status().is_success() {
        return String::new();
    }
    response.text().await.unwrap_or_default()
}

fn chain_visibility_snapshot(
    esplora_url: &str,
    txid: &str,
    esplora_height: &str,
    status_body: &str,
    raw_status: u16,
) -> String {
    let bitcoind_height = bitcoin_cli_stdout(&["getblockcount"]);
    format!(
        "bitcoind_height={bitcoind_height} esplora_height={} raw={raw_status} status={status_body} esplora={esplora_url} txid={txid}",
        esplora_height.trim()
    )
}

async fn wait_until_esplora_tip_matches_bitcoind(esplora_url: &str) {
    let deadline = Instant::now() + CHAIN_VISIBILITY_TIMEOUT;
    let mut last_snapshot = String::new();
    while Instant::now() < deadline {
        let bitcoind_height = bitcoin_cli_stdout(&["getblockcount"]);
        let esplora_height = esplora_text(esplora_url, "blocks/tip/height").await;
        last_snapshot = format!(
            "bitcoind_height={bitcoind_height} esplora_height={}",
            esplora_height.trim()
        );
        if !bitcoind_height.is_empty() && bitcoind_height == esplora_height.trim() {
            return;
        }
        tokio::time::sleep(Duration::from_millis(200)).await;
    }
    panic!("Esplora tip did not match bitcoind within 20s ({last_snapshot})");
}

async fn wait_for_orphaned_step_in_mempool(esplora_url: &str, txid: &str) {
    let deadline = Instant::now() + CHAIN_VISIBILITY_TIMEOUT;
    let mut last_snapshot = String::new();
    while Instant::now() < deadline {
        let bitcoind_height = bitcoin_cli_stdout(&["getblockcount"]);
        let esplora_height = esplora_text(esplora_url, "blocks/tip/height").await;
        let raw_status = esplora_tx_endpoint_status(esplora_url, txid, "/raw").await;
        let status_body = esplora_text(esplora_url, &format!("tx/{txid}/status")).await;
        let confirmed = serde_json::from_str::<EsploraTxStatusBody>(status_body.trim())
            .ok()
            .map(|status| status.confirmed);
        last_snapshot =
            chain_visibility_snapshot(esplora_url, txid, &esplora_height, &status_body, raw_status);
        if !bitcoind_height.is_empty()
            && bitcoind_height == esplora_height.trim()
            && raw_status == 200
            && confirmed == Some(false)
        {
            return;
        }
        tokio::time::sleep(Duration::from_millis(200)).await;
    }
    panic!("orphaned step stayed confirmed or unseen ({last_snapshot})");
}

/// Fund the bumper, tag the plan, and broadcast step 0.
async fn relay_first_step(
    session: ArkSession,
    endpoints: &RegtestEndpoints,
    batch_outpoints: Vec<VirtualOutPoint>,
    exit_branch_txids: &[String],
    require_multi_step: bool,
) -> FirstChainedStep {
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
    if require_multi_step {
        assert!(
            estimate.projected_unroll_steps >= 2,
            "expected multi-step batch, got {} projected steps",
            estimate.projected_unroll_steps
        );
    }

    fund_bumper_wallet(&session, endpoints, BUMPER_SATS).await;

    session
        .tag_unilateral_exit_plan(&batch_outpoints)
        .expect("tag unilateral exit plan");

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
            for txid in exit_branch_txids.iter().take(3) {
                diagnostics.push(esplora_tx_diagnostics(&endpoints.esplora_url, txid).await);
            }
            panic!(
                "proceed_unilateral_exit_step failed: {error}; {}",
                diagnostics.join("; ")
            );
        }
    };

    assert_eq!(proceed.step_index, 0, "first proceed should target step 0");
    if require_multi_step {
        assert!(
            proceed.total_steps >= 2,
            "expected multi-step branch, got total_steps={}",
            proceed.total_steps
        );
    }
    assert_eq!(
        proceed.phase,
        UnilateralExitPhase::Waiting,
        "first proceed should enter waiting for confirmation"
    );

    let first_step_txid = proceed
        .step_txid
        .clone()
        .or_else(|| exit_branch_txids.first().cloned())
        .expect("first step txid from proceed or topology");

    let raw_after_proceed =
        esplora_tx_endpoint_status(&endpoints.esplora_url, &first_step_txid, "/raw").await;
    assert_eq!(
        raw_after_proceed,
        200,
        "expected first step tx on Esplora /raw after proceed (mempool relay); {}",
        esplora_tx_diagnostics(&endpoints.esplora_url, &first_step_txid).await
    );

    FirstChainedStep {
        session,
        esplora_url: endpoints.esplora_url.clone(),
        batch_outpoints,
        first_step_txid,
    }
}

/// Board, split into a chained preconfirmed tree, fund the bumper, and broadcast step 0.
async fn broadcast_first_chained_step() -> FirstChainedStep {
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
        .filter(|row| {
            row.can_start_unroll && row.virtual_status_state.as_str() == VTXO_STATUS_PRECONFIRMED
        })
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

    relay_first_step(
        session,
        &endpoints,
        batch_outpoints,
        &topology.exit_branch_txids,
        true,
    )
    .await
}

/// Board one VTXO and broadcast its batch-tree leaf.
///
/// A one-receiver round is a single tree transaction, so that leaf is both the first unroll step
/// and the exit-eligible VTXO host. A preconfirmed self-send spends the leaf, which is why the
/// REG-07 chain's first step has no exit record.
async fn broadcast_settled_exit_host_step() -> FirstChainedStep {
    let endpoints = regtest_endpoints();
    let (session, _) = prepare_boarded_session(&endpoints, DEFAULT_BOARD_SATS).await;

    let candidates = session
        .list_exit_candidates()
        .await
        .expect("exit candidates after boarding");
    let startable_outpoints: Vec<VirtualOutPoint> = candidates
        .iter()
        .filter(|row| row.can_start_unroll)
        .map(|row| VirtualOutPoint::parse(&row.txid, row.vout).expect("candidate outpoint"))
        .collect();
    assert!(
        !startable_outpoints.is_empty(),
        "expected the settled boarding VTXO to be an exit candidate"
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
        "topology must expose the settled leaf"
    );
    let first_step_txid = topology
        .exit_branch_txids
        .first()
        .cloned()
        .expect("settled unroll branch");
    assert!(
        topology
            .host_outpoints
            .iter()
            .any(|host| host.txid == first_step_txid),
        "first unroll step {first_step_txid} must host an exit-eligible VTXO (nodes={:?}, hosts={:?})",
        topology
            .nodes
            .iter()
            .map(|node| (node.tx_type.as_str(), node.txid.as_str()))
            .collect::<Vec<_>>(),
        topology
            .host_outpoints
            .iter()
            .map(|host| (host.txid.as_str(), host.vout))
            .collect::<Vec<_>>()
    );

    relay_first_step(
        session,
        &endpoints,
        batch_outpoints,
        &topology.exit_branch_txids,
        false,
    )
    .await
}

#[tokio::test]
#[ignore = "chained preconfirmed proceed+broadcast on live regtest — run after `ARKD_VTXO_TREE_EXPIRY=200 npm run regtest:clean-start`; complements E2E-ARK-REG-07. ARKADE_REGTEST_RUN=1 cargo test -p bitboard-ark --test preconfirmed_unilateral_exit_proceed_regtest -- --ignored --nocapture --test-threads=1"]
async fn chained_preconfirmed_proceed_relays_first_step_tx_on_regtest() {
    if !regtest_enabled() {
        return;
    }

    let FirstChainedStep {
        session,
        batch_outpoints,
        ..
    } = broadcast_first_chained_step().await;

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

fn assert_step_records_phase(session: &ArkSession, step_txid: &str, expected: VtxoExitPhase) {
    let records = session.list_vtxo_exit_records();
    let records_on_step: Vec<_> = records
        .iter()
        .filter(|record| record.txid == step_txid)
        .collect();
    assert!(
        !records_on_step.is_empty(),
        "expected vtxo exit records on {step_txid}, records={:?}",
        records
            .iter()
            .map(|record| (record.txid.as_str(), record.vout, record.phase))
            .collect::<Vec<_>>()
    );
    assert!(
        records_on_step
            .iter()
            .all(|record| record.phase == expected),
        "expected {expected:?} on {step_txid}, got {:?}",
        records_on_step
            .iter()
            .map(|record| (record.vout, record.phase))
            .collect::<Vec<_>>()
    );
}

#[tokio::test]
#[ignore = "one-confirmation reorg of a settled exit-host leaf — ARKD_VTXO_TREE_EXPIRY=200 and a rebuilt esplora_gateway. ARKADE_REGTEST_RUN=1 cargo test -p bitboard-ark --test preconfirmed_unilateral_exit_proceed_regtest settled_exit_host_first_step_reorg_rewinds_to_host_relayed_on_regtest -- --ignored --nocapture --test-threads=1"]
async fn settled_exit_host_first_step_reorg_rewinds_to_host_relayed_on_regtest() {
    if !regtest_enabled() {
        return;
    }

    let FirstChainedStep {
        session,
        esplora_url,
        batch_outpoints,
        first_step_txid,
    } = broadcast_settled_exit_host_step().await;

    mine_blocks(1);
    wait_until_esplora_tip_matches_bitcoind(&esplora_url).await;

    // This branch is the one settled leaf. A progress read while that step is confirmed completes
    // the job and clears the step-wait, so a later reorg would look idle. Sync records the 1-conf
    // host phase and leaves the wait in place for the orphan.
    session
        .sync_with_operator()
        .await
        .expect("sync after confirming the exit host");
    assert_step_records_phase(&session, &first_step_txid, VtxoExitPhase::HostConfirmed);

    run_regtest_cli(&["reorg-excluding-mempool", "1"]);
    wait_for_orphaned_step_in_mempool(&esplora_url, &first_step_txid).await;

    let progress_after_reorg = session
        .get_unilateral_exit_progress(UnilateralExitProgressParams {
            vtxo_outpoints: batch_outpoints.clone(),
        })
        .await
        .expect("progress after reorg");
    assert_eq!(progress_after_reorg.step_index, 0);
    assert_eq!(progress_after_reorg.phase, UnilateralExitPhase::Waiting);
    assert!(progress_after_reorg.current_step_tx_relayed);
    let reorged_node = progress_after_reorg
        .node_statuses
        .iter()
        .find(|node| node.txid == first_step_txid)
        .unwrap_or_else(|| panic!("missing node status for {first_step_txid}"));
    assert_eq!(reorged_node.confirmations, 0);
    assert_step_records_phase(&session, &first_step_txid, VtxoExitPhase::HostRelayed);

    let viability = session
        .evaluate_unilateral_exit_job_viability(UnilateralExitProgressParams {
            vtxo_outpoints: batch_outpoints.clone(),
        })
        .await
        .expect("viability after reorg");
    assert_eq!(
        viability.status,
        UnilateralExitJobViabilityKind::Ok,
        "viability reason {}",
        viability.reason_code
    );

    mine_blocks(1);
    wait_until_esplora_tip_matches_bitcoind(&esplora_url).await;

    let progress_after_remine = session
        .get_unilateral_exit_progress(UnilateralExitProgressParams {
            vtxo_outpoints: batch_outpoints,
        })
        .await
        .expect("progress after re-mining the package");
    assert!(
        progress_after_remine.step_index >= 1,
        "expected step index to advance again, got step {}/{} phase {:?}",
        progress_after_remine.step_index,
        progress_after_remine.total_steps,
        progress_after_remine.phase
    );
    assert_step_records_phase(&session, &first_step_txid, VtxoExitPhase::HostConfirmed);
}
