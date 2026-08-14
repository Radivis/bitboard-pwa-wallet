//! Native integration tests for unilateral exit job viability terminal failure paths.
//!
//! **Branch funding probe model** (`evaluate_branch_funding_interference`):
//! 1. Collect exit-relevant VTXO outpoints: job leaf siblings + snapshot/operator records on
//!    `tree`/`ark` hosts in the unroll topology (not checkpoint/commitment nodes).
//! 2. For each outpoint not yet marked locally unrolled, ask Esplora: was `(virtual_txid, vout)`
//!    spent on-chain? (`GET /tx/{virtual_txid}/outspends[vout]`).
//! 3. If spent by a txid **not** in the wallet's `ordered_step_txids` (pre-built unroll branch),
//!    report `BranchFundingLost` — ASP (or anyone) moved/seized funding outside the wallet chain.
//!
//! This only fires once the hosting virtual tx is probeable on Esplora. Pure off-chain VTXOs
//! (pre-unroll boarded leaves) return outspend 404/500 and are skipped — no false positive, but
//! also no on-chain detection until branch material exists.

use std::collections::{BTreeMap, HashMap};

use ark_client::{Blockchain, Error, SpendStatus, TxStatus};
use ark_core::server::{ChainedTxType, VtxoChain, VtxoChains};
use bitcoin::hashes::Hash;
use bitcoin::{Address, Amount, OutPoint, ScriptBuf, Transaction, Txid};

use crate::api_types::UnilateralExitJobViabilityKind;
use crate::outpoint::VirtualOutPoint;
use crate::persistence::{OffchainVtxoSnapshot, VirtualTxOutPointRecord};
use crate::session::unilateral_exit_job_viability::{
    detect_asp_swept_from_sources, evaluate_branch_funding_interference,
};
use crate::session::unilateral_exit_orchestrator::{LeafUnilateralContext, UnilateralBatchPlan};

fn txid(byte: u8) -> Txid {
    Txid::from_byte_array([byte; 32])
}

/// Virtual `tree` tx hosting the job leaf VTXO (off-chain artifact id).
const LEAF_VIRTUAL_TX_BYTE: u8 = 0x15;
/// First tx in the wallet's pre-built unilateral unroll branch for this leaf.
const WALLET_UNROLL_BRANCH_TX_BYTE: u8 = 0x16;
/// ASP-published tx that spends the leaf VTXO outside the wallet unroll chain.
const ASP_SEIZURE_TX_BYTE: u8 = 0x17;
/// Upstream `ark` host on the path (sibling funding), not the terminal leaf tx.
const UPSTREAM_ARK_HOST_TX_BYTE: u8 = 0x18;

struct MockBlockchain {
    output_spends: HashMap<(Txid, u32), Txid>,
    outspend_probe_error: bool,
    transaction_not_found: bool,
}

impl MockBlockchain {
    fn with_foreign_spend(monitored: VirtualOutPoint, foreign_spend_txid: Txid) -> Self {
        Self {
            output_spends: HashMap::from([((monitored.txid, monitored.vout), foreign_spend_txid)]),
            outspend_probe_error: false,
            transaction_not_found: false,
        }
    }

    fn with_unprobeable_outspends() -> Self {
        Self {
            output_spends: HashMap::new(),
            outspend_probe_error: true,
            transaction_not_found: false,
        }
    }

    fn with_transaction_not_found() -> Self {
        Self {
            output_spends: HashMap::new(),
            outspend_probe_error: false,
            transaction_not_found: true,
        }
    }
}

impl Blockchain for MockBlockchain {
    fn find_outpoints(
        &self,
        _address: &Address,
    ) -> impl std::future::Future<Output = Result<Vec<ark_core::ExplorerUtxo>, Error>> + Send {
        async { Ok(vec![]) }
    }

    fn find_tx(
        &self,
        _txid: &Txid,
    ) -> impl std::future::Future<Output = Result<Option<Transaction>, Error>> + Send {
        async move { Ok(None) }
    }

    fn get_tx_status(
        &self,
        _txid: &Txid,
    ) -> impl std::future::Future<Output = Result<TxStatus, Error>> + Send {
        async move { Ok(TxStatus { confirmed_at: None }) }
    }

    fn get_output_status(
        &self,
        txid: &Txid,
        vout: u32,
    ) -> impl std::future::Future<Output = Result<SpendStatus, Error>> + Send {
        let outspend_probe_error = self.outspend_probe_error;
        let transaction_not_found = self.transaction_not_found;
        let spend_txid = self.output_spends.get(&(txid.clone(), vout)).cloned();
        async move {
            if transaction_not_found {
                return Err(Error::wallet(
                    "Ark client error: HttpResponse { status: 404, message: \"Transaction not found\" }",
                ));
            }
            if outspend_probe_error {
                return Err(Error::wallet(
                    "HttpResponse { status: 500, message: \"{\\\"error\\\":\\\"Failed to get transaction outspends\\\"}\" }",
                ));
            }
            Ok(SpendStatus { spend_txid })
        }
    }

    fn broadcast(
        &self,
        _tx: &Transaction,
    ) -> impl std::future::Future<Output = Result<(), Error>> + Send {
        async { Ok(()) }
    }

    fn get_fee_rate(&self) -> impl std::future::Future<Output = Result<f64, Error>> + Send {
        async { Ok(1.0) }
    }

    fn broadcast_package(
        &self,
        _txs: &[&Transaction],
    ) -> impl std::future::Future<Output = Result<(), Error>> + Send {
        async { Ok(()) }
    }
}

fn sample_plan(leaf_outpoint: VirtualOutPoint, step_txid: Txid) -> UnilateralBatchPlan {
    let leaf_txid = leaf_outpoint.txid;
    UnilateralBatchPlan {
        leaves: vec![LeafUnilateralContext {
            leaf_txid,
            sibling_outpoints: vec![leaf_outpoint],
            chains: VtxoChains {
                inner: vec![VtxoChain {
                    txid: leaf_txid,
                    tx_type: ChainedTxType::Tree,
                    spends: vec![],
                    expires_at: 0,
                }],
            },
            branch_txids: vec![],
            commitment_txids: vec![],
            amount_sats: 100_000,
        }],
        ordered_step_txids: vec![step_txid],
        tx_by_id: HashMap::new(),
    }
}

fn asp_swept_snapshot(leaf_outpoint: &VirtualOutPoint) -> OffchainVtxoSnapshot {
    OffchainVtxoSnapshot {
        synced_at: 1,
        dust_sats: 330,
        virtual_tx_outpoints: vec![VirtualTxOutPointRecord {
            txid: leaf_outpoint.txid.to_string(),
            vout: leaf_outpoint.vout,
            created_at: 0,
            expires_at: 9_999_999_999,
            amount_sats: 100_000,
            script_hex: String::new(),
            is_preconfirmed: false,
            is_swept: true,
            is_unrolled: false,
            is_spent: false,
            spent_by: None,
            commitment_txids: vec![],
            settled_by: None,
            ark_txid: None,
            assets: vec![],
            server_pk_hex: None,
        }],
        unilateral_exit_materials_by_leaf_tx: BTreeMap::new(),
    }
}

fn operator_vtxo_swept(leaf_outpoint: &VirtualOutPoint) -> ark_core::server::VirtualTxOutPoint {
    ark_core::server::VirtualTxOutPoint {
        outpoint: OutPoint {
            txid: leaf_outpoint.txid,
            vout: leaf_outpoint.vout,
        },
        created_at: 0,
        expires_at: 0,
        amount: Amount::from_sat(100_000),
        script: ScriptBuf::new(),
        is_preconfirmed: false,
        is_swept: true,
        is_unrolled: false,
        is_spent: false,
        spent_by: None,
        commitment_txids: vec![],
        settled_by: None,
        ark_txid: None,
        assets: vec![],
    }
}

fn exit_eligible_host_record(host_txid: Txid, vout: u32) -> VirtualTxOutPointRecord {
    VirtualTxOutPointRecord {
        txid: host_txid.to_string(),
        vout,
        created_at: 0,
        expires_at: 9_999_999_999,
        amount_sats: 50_000,
        script_hex: String::new(),
        is_preconfirmed: true,
        is_swept: false,
        is_unrolled: false,
        is_spent: false,
        spent_by: None,
        commitment_txids: vec![],
        settled_by: None,
        ark_txid: None,
        assets: vec![],
        server_pk_hex: None,
    }
}

#[test]
fn asp_swept_targets_from_offchain_snapshot() {
    let leaf_outpoint = VirtualOutPoint::new(txid(10), 0);
    let snapshot = asp_swept_snapshot(&leaf_outpoint);
    let detected = detect_asp_swept_from_sources(
        &[leaf_outpoint.clone()],
        Some(&snapshot),
        &[],
        |_txid, _vout| false,
    );
    assert_eq!(detected, Some(leaf_outpoint));
}

#[test]
fn asp_swept_targets_from_operator_vtxo_list() {
    let leaf_outpoint = VirtualOutPoint::new(txid(11), 0);
    let operator_vtxos = vec![operator_vtxo_swept(&leaf_outpoint)];
    let detected = detect_asp_swept_from_sources(
        &[leaf_outpoint.clone()],
        None,
        &operator_vtxos,
        |_txid, _vout| false,
    );
    assert_eq!(detected, Some(leaf_outpoint));
}

#[tokio::test]
async fn branch_funding_lost_when_leaf_vtxo_spent_by_asp_seizure_tx() {
    // Leaf VTXO on virtual tree tx; Esplora reports spend by ASP tx, not wallet branch tx.
    let leaf_virtual_tx = txid(LEAF_VIRTUAL_TX_BYTE);
    let leaf_outpoint = VirtualOutPoint::new(leaf_virtual_tx, 0);
    let wallet_unroll_branch_tx = txid(WALLET_UNROLL_BRANCH_TX_BYTE);
    let asp_seizure_tx = txid(ASP_SEIZURE_TX_BYTE);
    let plan = sample_plan(leaf_outpoint.clone(), wallet_unroll_branch_tx);
    let blockchain = MockBlockchain::with_foreign_spend(leaf_outpoint.clone(), asp_seizure_tx);

    let viability =
        evaluate_branch_funding_interference(&blockchain, &plan, &[], |_outpoint| false)
            .await
            .expect("evaluate branch funding interference");

    let viability = viability.expect("expected BranchFundingLost viability");
    assert_eq!(
        viability.status,
        UnilateralExitJobViabilityKind::BranchFundingLost
    );
    assert_eq!(viability.reason_code, "branch_funding_lost");
    assert_eq!(viability.offending_outpoints, vec![leaf_outpoint]);
    assert!(
        viability
            .detail_message
            .as_ref()
            .is_some_and(|message| message.contains("outside the wallet unroll chain"))
    );
}

#[tokio::test]
async fn branch_funding_ok_when_leaf_vtxo_spent_by_wallet_unroll_branch_tx() {
    let leaf_virtual_tx = txid(LEAF_VIRTUAL_TX_BYTE);
    let leaf_outpoint = VirtualOutPoint::new(leaf_virtual_tx, 0);
    let wallet_unroll_branch_tx = txid(WALLET_UNROLL_BRANCH_TX_BYTE);
    let plan = sample_plan(leaf_outpoint.clone(), wallet_unroll_branch_tx);
    let blockchain =
        MockBlockchain::with_foreign_spend(leaf_outpoint.clone(), wallet_unroll_branch_tx);

    let viability =
        evaluate_branch_funding_interference(&blockchain, &plan, &[], |_outpoint| false)
            .await
            .expect("evaluate branch funding interference");

    assert!(
        viability.is_none(),
        "spend by wallet unroll branch tx {:?} must not be ASP interference",
        wallet_unroll_branch_tx
    );
}

#[tokio::test]
async fn branch_funding_lost_when_upstream_ark_host_vtxo_spent_by_asp_seizure_tx() {
    let leaf_virtual_tx = txid(LEAF_VIRTUAL_TX_BYTE);
    let leaf_outpoint = VirtualOutPoint::new(leaf_virtual_tx, 0);
    let upstream_ark_host_tx = txid(UPSTREAM_ARK_HOST_TX_BYTE);
    let upstream_host_outpoint = VirtualOutPoint::new(upstream_ark_host_tx, 1);
    let wallet_unroll_branch_tx = txid(WALLET_UNROLL_BRANCH_TX_BYTE);
    let asp_seizure_tx = txid(ASP_SEIZURE_TX_BYTE);
    let plan = sample_plan(leaf_outpoint, wallet_unroll_branch_tx);
    let host_records = vec![exit_eligible_host_record(upstream_ark_host_tx, 1)];
    let blockchain =
        MockBlockchain::with_foreign_spend(upstream_host_outpoint.clone(), asp_seizure_tx);

    let viability =
        evaluate_branch_funding_interference(&blockchain, &plan, &host_records, |_outpoint| false)
            .await
            .expect("evaluate branch funding interference for upstream host");

    let viability = viability.expect("expected BranchFundingLost for upstream host");
    assert_eq!(
        viability.offending_outpoints,
        vec![upstream_host_outpoint],
        "ASP seizure of upstream ark host funding, not the terminal leaf outpoint"
    );
}

#[tokio::test]
async fn branch_funding_interference_none_when_no_foreign_spend() {
    let leaf_outpoint = VirtualOutPoint::new(txid(18), 0);
    let allowed_step_txid = txid(19);
    let plan = sample_plan(leaf_outpoint, allowed_step_txid);
    let blockchain = MockBlockchain {
        output_spends: HashMap::new(),
        outspend_probe_error: false,
        transaction_not_found: false,
    };

    let viability =
        evaluate_branch_funding_interference(&blockchain, &plan, &[], |_outpoint| false)
            .await
            .expect("evaluate branch funding interference");

    assert!(viability.is_none());
}

#[tokio::test]
async fn branch_funding_interference_none_when_outspends_endpoint_unavailable() {
    let leaf_outpoint = VirtualOutPoint::new(txid(20), 0);
    let allowed_step_txid = txid(21);
    let plan = sample_plan(leaf_outpoint, allowed_step_txid);
    let blockchain = MockBlockchain::with_unprobeable_outspends();

    let viability =
        evaluate_branch_funding_interference(&blockchain, &plan, &[], |_outpoint| false)
            .await
            .expect("evaluate branch funding interference when outspends fail");

    assert!(viability.is_none());
}

#[tokio::test]
async fn branch_funding_interference_none_when_esplora_returns_transaction_not_found() {
    let leaf_outpoint = VirtualOutPoint::new(txid(22), 0);
    let allowed_step_txid = txid(23);
    let plan = sample_plan(leaf_outpoint, allowed_step_txid);
    let blockchain = MockBlockchain::with_transaction_not_found();

    let viability =
        evaluate_branch_funding_interference(&blockchain, &plan, &[], |_outpoint| false)
            .await
            .expect("evaluate branch funding interference when tx is not on chain yet");

    assert!(viability.is_none());
}
