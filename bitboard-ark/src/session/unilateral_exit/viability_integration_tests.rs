//! Native integration tests for unilateral exit job viability terminal failure paths.
//!
//! **Branch funding probe model** (`evaluate_branch_funding_interference`):
//! 1. Probe **first unroll step prevouts** (`ordered_step_txids[0]` inputs / commitment funding)
//!    on every pass. Never skip for local `is_unrolled`. Unspent, our spend, or Esplora 404/500
//!    are not interference; a foreign spend is `BranchFundingLost` (covers ASP batch sweep
//!    before any virtual tx is on chain; re-probed for reorgs).
//! 2. Collect exit-relevant VTXO outpoints: job leaf siblings + snapshot/operator records on
//!    `tree`/`ark` hosts in the unroll topology (not checkpoint/commitment nodes).
//! 3. For each VTXO outpoint not yet marked locally unrolled, ask Esplora: was
//!    `(virtual_txid, vout)` spent on-chain? (`GET /tx/{virtual_txid}/outspends[vout]`).
//! 4. If spent by a txid **not** in the wallet's `ordered_step_txids` (pre-built unroll branch),
//!    report `BranchFundingLost` — ASP (or anyone) moved/seized funding outside the wallet chain.
//!
//! VTXO probes only fire once the hosting virtual tx is probeable on Esplora. Pure off-chain
//! VTXOs (pre-unroll boarded leaves) return outspend 404/500 and are skipped — no false
//! positive. The first-step prevout is already on-chain (the commitment) and closes that hole.

use std::collections::{BTreeMap, HashMap};

use ark_client::{Blockchain, Error, SpendStatus, TxStatus};
use ark_core::server::{ChainedTxType, VtxoChain, VtxoChains};
use bitcoin::hashes::Hash;
use bitcoin::{Address, Transaction, Txid};

use crate::api_types::UnilateralExitJobViabilityKind;
use crate::outpoint::VirtualOutPoint;
use crate::persistence::{OffchainVtxoSnapshot, VirtualTxOutPointRecord};
use crate::session::unilateral_exit::plan::{LeafUnilateralContext, UnilateralBatchPlan};
use crate::session::unilateral_exit::viability::{
    asp_swept_viability_outpoint, detect_asp_swept_from_snapshot,
    evaluate_branch_funding_interference, first_unroll_step_funding_prevouts,
    first_unroll_step_funding_prevouts_from_snapshot,
};
use crate::unilateral_exit_materials::{
    materials_record_from_prefetch, store_materials_for_leaf_tx,
};

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
/// On-chain commitment / batch output spent by the first unroll step.
const COMMITMENT_TX_BYTE: u8 = 0x01;

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
    async fn find_outpoints(
        &self,
        _address: &Address,
    ) -> Result<Vec<ark_core::ExplorerUtxo>, Error> {
        Ok(vec![])
    }

    async fn find_tx(&self, _txid: &Txid) -> Result<Option<Transaction>, Error> {
        Ok(None)
    }

    async fn get_tx_status(&self, _txid: &Txid) -> Result<TxStatus, Error> {
        Ok(TxStatus { confirmed_at: None })
    }

    async fn get_output_status(&self, txid: &Txid, vout: u32) -> Result<SpendStatus, Error> {
        if self.transaction_not_found {
            return Err(Error::wallet(
                "Ark client error: HttpResponse { status: 404, message: \"Transaction not found\" }",
            ));
        }
        if self.outspend_probe_error {
            return Err(Error::wallet(
                "HttpResponse { status: 500, message: \"{\\\"error\\\":\\\"Failed to get transaction outspends\\\"}\" }",
            ));
        }
        Ok(SpendStatus {
            spend_txid: self.output_spends.get(&(*txid, vout)).cloned(),
        })
    }

    async fn broadcast(&self, _tx: &Transaction) -> Result<(), Error> {
        Ok(())
    }

    async fn get_fee_rate(&self) -> Result<f64, Error> {
        Ok(1.0)
    }

    async fn broadcast_package(&self, _txs: &[&Transaction]) -> Result<(), Error> {
        Ok(())
    }
}

fn dummy_tx_spending(parents: &[Txid]) -> Transaction {
    let inputs = parents
        .iter()
        .map(|parent| bitcoin::TxIn {
            previous_output: bitcoin::OutPoint {
                txid: *parent,
                vout: 0,
            },
            script_sig: bitcoin::ScriptBuf::new(),
            sequence: bitcoin::Sequence::MAX,
            witness: bitcoin::Witness::new(),
        })
        .collect();
    Transaction {
        version: bitcoin::transaction::Version::TWO,
        lock_time: bitcoin::absolute::LockTime::ZERO,
        input: inputs,
        output: vec![],
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

fn sample_plan_with_first_step_prevout() -> (UnilateralBatchPlan, VirtualOutPoint, Txid) {
    let commitment = txid(COMMITMENT_TX_BYTE);
    let first_step_tx = dummy_tx_spending(&[commitment]);
    let first_step_txid = first_step_tx.compute_txid();
    let leaf_outpoint = VirtualOutPoint::new(txid(LEAF_VIRTUAL_TX_BYTE), 0);
    let mut plan = sample_plan(leaf_outpoint, first_step_txid);
    plan.tx_by_id.insert(first_step_txid, first_step_tx);
    let commitment_prevout = VirtualOutPoint::new(commitment, 0);
    (plan, commitment_prevout, first_step_txid)
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
    let detected = detect_asp_swept_from_snapshot(
        std::slice::from_ref(&leaf_outpoint),
        Some(&snapshot),
        |_txid| false,
    );
    assert_eq!(detected, Some(leaf_outpoint));
}

#[test]
fn asp_swept_ignored_when_autonomous() {
    let leaf_outpoint = VirtualOutPoint::new(txid(10), 0);
    let snapshot = asp_swept_snapshot(&leaf_outpoint);
    let detected = asp_swept_viability_outpoint(
        true,
        std::slice::from_ref(&leaf_outpoint),
        Some(&snapshot),
        |_txid| false,
    );
    assert_eq!(detected, None);
}

#[test]
fn asp_swept_still_detected_when_not_autonomous() {
    let leaf_outpoint = VirtualOutPoint::new(txid(10), 0);
    let snapshot = asp_swept_snapshot(&leaf_outpoint);
    let detected = asp_swept_viability_outpoint(
        false,
        std::slice::from_ref(&leaf_outpoint),
        Some(&snapshot),
        |_txid| false,
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

#[test]
fn seized_branch_lookup_errors_when_exit_materials_are_missing() {
    use crate::error::ArkWasmError;
    use crate::persistence::{VtxoExitPhase, VtxoExitRecord, vtxo_exit_record_key};
    use crate::session::unilateral_exit::vtxo_exit::pre_unroll_record_keys_on_same_branch;

    let host = txid(0x21).to_string();
    let snapshot = OffchainVtxoSnapshot {
        synced_at: 1,
        dust_sats: 330,
        virtual_tx_outpoints: vec![],
        unilateral_exit_materials_by_leaf_tx: BTreeMap::new(),
    };
    let mut records = BTreeMap::new();
    records.insert(
        vtxo_exit_record_key(&host, 0),
        VtxoExitRecord {
            phase: VtxoExitPhase::Tagged,
            tagged_at: 1,
            host_txid: host.clone(),
            amount_sats: 1_000,
        },
    );
    let error = pre_unroll_record_keys_on_same_branch(&snapshot, &records, &host, 0)
        .expect_err("missing exit materials must not invent a one-txid branch");
    assert!(matches!(
        error,
        ArkWasmError::AutonomousExitMaterialsMissing
    ));
    assert_eq!(
        records
            .get(&vtxo_exit_record_key(&host, 0))
            .map(|record| record.phase),
        Some(VtxoExitPhase::Tagged)
    );
}

#[test]
fn first_unroll_step_funding_prevouts_returns_commitment_prevout() {
    let (plan, commitment_prevout, _first_step_txid) = sample_plan_with_first_step_prevout();
    let prevouts = first_unroll_step_funding_prevouts(&plan);
    assert_eq!(prevouts, vec![commitment_prevout]);
}

#[tokio::test]
async fn branch_funding_lost_when_first_step_prevout_spent_by_asp_sweep() {
    let (plan, commitment_prevout, _first_step_txid) = sample_plan_with_first_step_prevout();
    let asp_sweep_tx = txid(ASP_SEIZURE_TX_BYTE);
    let blockchain = MockBlockchain::with_foreign_spend(commitment_prevout.clone(), asp_sweep_tx);

    let viability =
        evaluate_branch_funding_interference(&blockchain, &plan, &[], |_outpoint| false)
            .await
            .expect("evaluate branch funding interference");

    let viability = viability.expect("expected BranchFundingLost for commitment prevout");
    assert_eq!(
        viability.status,
        UnilateralExitJobViabilityKind::BranchFundingLost
    );
    assert_eq!(viability.reason_code, "branch_funding_lost");
    assert_eq!(viability.offending_outpoints, vec![commitment_prevout]);
}

#[tokio::test]
async fn branch_funding_ok_when_first_step_prevout_spent_by_wallet_first_step() {
    let (plan, commitment_prevout, first_step_txid) = sample_plan_with_first_step_prevout();
    let blockchain = MockBlockchain::with_foreign_spend(commitment_prevout, first_step_txid);

    let viability =
        evaluate_branch_funding_interference(&blockchain, &plan, &[], |_outpoint| false)
            .await
            .expect("evaluate branch funding interference");

    assert!(
        viability.is_none(),
        "spend by first unroll step {first_step_txid:?} must not be ASP interference"
    );
}

#[tokio::test]
async fn branch_funding_none_when_first_step_prevout_unspent() {
    let (plan, _commitment_prevout, _first_step_txid) = sample_plan_with_first_step_prevout();
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
async fn branch_funding_none_when_first_step_prevout_outspend_unavailable() {
    let (plan, _commitment_prevout, _first_step_txid) = sample_plan_with_first_step_prevout();
    let blockchain = MockBlockchain::with_unprobeable_outspends();

    let viability =
        evaluate_branch_funding_interference(&blockchain, &plan, &[], |_outpoint| false)
            .await
            .expect("evaluate when first-step prevout outspends fail");

    assert!(viability.is_none());
}

#[tokio::test]
async fn branch_funding_none_when_first_step_prevout_tx_not_found() {
    let (plan, _commitment_prevout, _first_step_txid) = sample_plan_with_first_step_prevout();
    let blockchain = MockBlockchain::with_transaction_not_found();

    let viability =
        evaluate_branch_funding_interference(&blockchain, &plan, &[], |_outpoint| false)
            .await
            .expect("evaluate when first-step prevout is not on Esplora");

    assert!(viability.is_none());
}

#[tokio::test]
async fn first_step_prevout_probe_not_skipped_when_leaf_marked_unrolled() {
    let (plan, commitment_prevout, _first_step_txid) = sample_plan_with_first_step_prevout();
    let asp_sweep_tx = txid(ASP_SEIZURE_TX_BYTE);
    let blockchain = MockBlockchain::with_foreign_spend(commitment_prevout.clone(), asp_sweep_tx);

    let viability = evaluate_branch_funding_interference(&blockchain, &plan, &[], |_outpoint| true)
        .await
        .expect("evaluate with all VTXO outpoints skipped as unrolled");

    let viability = viability.expect("commitment prevout must not use the VTXO unroll skip");
    assert_eq!(
        viability.status,
        UnilateralExitJobViabilityKind::BranchFundingLost
    );
    assert_eq!(viability.offending_outpoints, vec![commitment_prevout]);
}

#[test]
fn first_unroll_step_funding_prevouts_from_snapshot_matches_psbt_inputs() {
    let commitment = txid(COMMITMENT_TX_BYTE);
    let first_step_tx = dummy_tx_spending(&[commitment]);
    let first_step_txid = first_step_tx.compute_txid();
    let leaf = txid(LEAF_VIRTUAL_TX_BYTE);
    let chains = VtxoChains {
        inner: vec![
            VtxoChain {
                txid: commitment,
                tx_type: ChainedTxType::Commitment,
                spends: vec![],
                expires_at: 0,
            },
            VtxoChain {
                txid: first_step_txid,
                tx_type: ChainedTxType::Tree,
                spends: vec![commitment],
                expires_at: 0,
            },
            VtxoChain {
                txid: leaf,
                tx_type: ChainedTxType::Ark,
                spends: vec![first_step_txid],
                expires_at: 0,
            },
        ],
    };
    let first_step_psbt =
        bitcoin::Psbt::from_unsigned_tx(first_step_tx).expect("unsigned first-step psbt");
    let materials =
        materials_record_from_prefetch(1, &chains, &[first_step_psbt]).expect("materials");
    let mut snapshot = OffchainVtxoSnapshot {
        synced_at: 1,
        dust_sats: 330,
        virtual_tx_outpoints: vec![],
        unilateral_exit_materials_by_leaf_tx: BTreeMap::new(),
    };
    store_materials_for_leaf_tx(&mut snapshot, &leaf.to_string(), materials);

    let prevouts = first_unroll_step_funding_prevouts_from_snapshot(&snapshot, &leaf.to_string())
        .expect("derive first-step prevouts from snapshot materials");
    assert_eq!(prevouts, vec![VirtualOutPoint::new(commitment, 0)]);
}
