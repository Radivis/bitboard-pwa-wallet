use std::collections::BTreeMap;
use std::collections::HashMap;
use std::collections::HashSet;
use std::str::FromStr;

use ark_client::compute_offchain_balance;
use ark_core::VtxoList;
use ark_core::history;
use ark_core::history::OutgoingTransaction;
use ark_core::history::Transaction;
use ark_core::history::sort_transactions_by_created_at;
use ark_core::server::{Info, VirtualTxOutPoint};
use bitcoin::hex::DisplayHex;
use bitcoin::hex::FromHex;
use bitcoin::{Amount, OutPoint, ScriptBuf, Txid, XOnlyPublicKey};

use crate::constants::UNILATERAL_EXIT_HOST_TX_CONFIRMATIONS;
use crate::error::{ArkResult, ArkWasmError};
use crate::exit_balance::{UnilateralExitOutpointKey, is_unilateral_exit_in_progress_outpoint};
use crate::persistence::{
    HostTxObservationRecord, OffchainVtxoSnapshot, UnilateralExitMaterialsRecord,
    VirtualTxOutPointAssetRecord, VirtualTxOutPointRecord, VtxoExitPhase, VtxoExitRecord,
};
use crate::session::unilateral_exit::vtxo_exit::unilateral_exit_pipeline_outpoints;

/// Signer-aware offchain balance buckets in satoshis.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct OffchainBalanceBuckets {
    pub pre_confirmed_sats: u64,
    pub confirmed_sats: u64,
    pub recoverable_sats: u64,
    pub pending_recovery_due_to_expired_signer_sats: u64,
}

impl OffchainBalanceBuckets {
    pub fn zero() -> Self {
        Self::default()
    }

    pub fn from_live(balance: &ark_client::OffChainBalance) -> Self {
        Self {
            pre_confirmed_sats: balance.pre_confirmed().to_sat(),
            confirmed_sats: balance.confirmed().to_sat(),
            recoverable_sats: balance.recoverable().to_sat(),
            pending_recovery_due_to_expired_signer_sats: balance.pending_recovery().to_sat(),
        }
    }

    pub fn gross_spendable_sats(&self) -> u64 {
        self.pre_confirmed_sats.saturating_add(self.confirmed_sats)
    }
}

pub fn vtxo_list_from_snapshot(snapshot: &OffchainVtxoSnapshot) -> ArkResult<VtxoList> {
    let dust = Amount::from_sat(snapshot.dust_sats);
    let points = snapshot
        .virtual_tx_outpoints
        .iter()
        .map(virtual_tx_outpoint_from_record)
        .collect::<Result<Vec<_>, _>>()?;
    Ok(VtxoList::new(dust, points))
}

/// Pending-recovery banner sats (`ARK-REC-07`). `exclude_pipeline_outpoints` is in-progress
/// unroll membership only — not the spend-lock set — so `funding_lost` can still count.
pub fn pending_recovery_due_to_expired_signer_sats_excluding_unilateral_exit(
    vtxo_list: &VtxoList,
    server_info: &Info,
    now: i64,
    script_to_server_pk: impl Fn(&ScriptBuf) -> Option<XOnlyPublicKey>,
    exclude_pipeline_outpoints: &HashSet<UnilateralExitOutpointKey>,
) -> u64 {
    vtxo_list
        .pending_recovery_due_to_signer_at(server_info, now, &script_to_server_pk)
        .filter(|virtual_tx_outpoint| {
            !is_unilateral_exit_in_progress_outpoint(
                exclude_pipeline_outpoints,
                &virtual_tx_outpoint.outpoint.txid.to_string(),
                virtual_tx_outpoint.outpoint.vout,
            )
        })
        .fold(Amount::ZERO, |accumulator, virtual_tx_outpoint| {
            accumulator + virtual_tx_outpoint.amount
        })
        .to_sat()
}

pub fn offchain_balance_buckets_from_snapshot(
    snapshot: &OffchainVtxoSnapshot,
    server_info: &Info,
    now: i64,
    legacy_signer_pk_fallback: Option<XOnlyPublicKey>,
    vtxo_exit_records: &BTreeMap<String, VtxoExitRecord>,
) -> ArkResult<OffchainBalanceBuckets> {
    let vtxo_list = vtxo_list_from_snapshot(snapshot)?;
    let script_lookup = script_to_server_pk_lookup(snapshot, legacy_signer_pk_fallback)?;
    let balance = compute_offchain_balance(&vtxo_list, &script_lookup, server_info, now)
        .map_err(ArkWasmError::from)?;
    let mut buckets = OffchainBalanceBuckets::from_live(&balance);
    // Pipeline only (`ARK-REC-07`): pending-recovery UX follows recover, not spend-lock.
    let exclude_pipeline = unilateral_exit_pipeline_outpoints(vtxo_exit_records);
    buckets.pending_recovery_due_to_expired_signer_sats =
        pending_recovery_due_to_expired_signer_sats_excluding_unilateral_exit(
            &vtxo_list,
            server_info,
            now,
            &script_lookup,
            &exclude_pipeline,
        );
    Ok(buckets)
}

/// Naive bucket sums without signer-aware filtering. Prefer [`offchain_balance_buckets_from_snapshot`].
#[allow(dead_code)]
pub fn offchain_balance_sats_from_snapshot(
    snapshot: &OffchainVtxoSnapshot,
) -> ArkResult<(u64, u64, u64)> {
    let buckets = {
        let vtxo_list = vtxo_list_from_snapshot(snapshot)?;
        let pre_confirmed = vtxo_list
            .pre_confirmed()
            .fold(Amount::ZERO, |acc, x| acc + x.amount)
            .to_sat();
        let confirmed = vtxo_list
            .confirmed()
            .fold(Amount::ZERO, |acc, x| acc + x.amount)
            .to_sat();
        let recoverable = vtxo_list
            .recoverable()
            .fold(Amount::ZERO, |acc, x| acc + x.amount)
            .to_sat();
        (pre_confirmed, confirmed, recoverable)
    };
    Ok(buckets)
}

pub(crate) fn script_to_server_pk_lookup(
    snapshot: &OffchainVtxoSnapshot,
    legacy_signer_pk_fallback: Option<XOnlyPublicKey>,
) -> ArkResult<impl Fn(&ScriptBuf) -> Option<XOnlyPublicKey> + '_> {
    let mut by_script: HashMap<ScriptBuf, XOnlyPublicKey> = HashMap::new();
    for record in &snapshot.virtual_tx_outpoints {
        let Some(hex) = record.server_pk_hex.as_deref() else {
            continue;
        };
        let script_bytes = Vec::from_hex(&record.script_hex)
            .map_err(|error| ArkWasmError::Snapshot(format!("invalid vtxo script: {error}")))?;
        let script = ScriptBuf::from_bytes(script_bytes);
        let server_pk = XOnlyPublicKey::from_str(hex)
            .map_err(|error| ArkWasmError::Snapshot(format!("invalid server_pk_hex: {error}")))?;
        by_script.insert(script, server_pk);
    }

    let any_record_has_server_pk = snapshot
        .virtual_tx_outpoints
        .iter()
        .any(|record| record.server_pk_hex.is_some());
    let all_records_have_server_pk = snapshot
        .virtual_tx_outpoints
        .iter()
        .all(|record| record.server_pk_hex.is_some());

    Ok(move |script: &ScriptBuf| {
        if let Some(server_pk) = by_script.get(script) {
            return Some(*server_pk);
        }
        if any_record_has_server_pk && !all_records_have_server_pk {
            // Mixed legacy/modern snapshot: missing per-vtxo keys are not spendable for signer-aware paths.
            return None;
        }
        legacy_signer_pk_fallback
    })
}

pub fn offchain_history_from_snapshot(
    snapshot: &OffchainVtxoSnapshot,
    boarding_commitment_transactions: &[Txid],
) -> ArkResult<Vec<Transaction>> {
    let vtxo_list = vtxo_list_from_snapshot(snapshot)?;
    let unspendable_outpoints = vtxo_list.unspendable().cloned().collect::<Vec<_>>();
    let unspent_outpoints = vtxo_list.all_unspent().cloned().collect::<Vec<_>>();

    let mut transactions = generate_incoming_vtxo_transaction_history(
        &unspendable_outpoints,
        &unspent_outpoints,
        boarding_commitment_transactions,
    )?;

    let outgoing_txs =
        generate_outgoing_vtxo_transaction_history(&unspendable_outpoints, &unspent_outpoints)?;

    for tx in outgoing_txs {
        let tx = match tx {
            OutgoingTransaction::Complete(tx) => tx,
            OutgoingTransaction::Incomplete(incomplete_tx) => {
                let first_outpoint = incomplete_tx.first_outpoint();
                let Some(virtual_tx_outpoint) = unspendable_outpoints
                    .iter()
                    .chain(unspent_outpoints.iter())
                    .find(|vtp| vtp.outpoint == first_outpoint)
                else {
                    continue;
                };
                match incomplete_tx.finish(virtual_tx_outpoint) {
                    Ok(tx) => tx,
                    Err(_) => continue,
                }
            }
            OutgoingTransaction::IncompleteOffboard(incomplete_offboard) => {
                incomplete_offboard.finish(None)
            }
        };
        transactions.push(tx);
    }

    sort_transactions_by_created_at(&mut transactions);
    Ok(transactions)
}

#[allow(dead_code)]
pub fn snapshot_from_virtual_tx_outpoints(
    dust_sats: u64,
    synced_at: i64,
    virtual_tx_outpoints: Vec<VirtualTxOutPoint>,
) -> OffchainVtxoSnapshot {
    snapshot_from_virtual_tx_outpoints_with_script_lookup(
        dust_sats,
        synced_at,
        virtual_tx_outpoints,
        |_| None,
    )
}

pub fn snapshot_from_virtual_tx_outpoints_with_script_lookup(
    dust_sats: u64,
    synced_at: i64,
    virtual_tx_outpoints: Vec<VirtualTxOutPoint>,
    script_to_server_pk: impl Fn(&ScriptBuf) -> Option<XOnlyPublicKey>,
) -> OffchainVtxoSnapshot {
    OffchainVtxoSnapshot {
        synced_at,
        dust_sats,
        virtual_tx_outpoints: virtual_tx_outpoints
            .into_iter()
            .map(|point| {
                let server_pk = script_to_server_pk(&point.script);
                virtual_tx_outpoint_to_record(point, server_pk)
            })
            .collect(),
        unilateral_exit_materials_by_host_tx: BTreeMap::new(),
        full_listed_at: 0,
    }
}

/// Deduplicate indexer rows by outpoint; later rows win (recent-script fetch after outpoints).
pub fn dedupe_virtual_tx_outpoints(
    points: impl IntoIterator<Item = VirtualTxOutPoint>,
) -> Vec<VirtualTxOutPoint> {
    let mut by_outpoint: HashMap<OutPoint, VirtualTxOutPoint> = HashMap::new();
    for point in points {
        by_outpoint.insert(point.outpoint, point);
    }
    by_outpoint.into_values().collect()
}

/// Upsert indexer rows into a persisted snapshot without dropping historical spent VTXOs (ARK-SYNC-04/06).
///
/// `requested_live_outpoints` are snapshot-live outpoints sent to `list_vtxos_for_outpoints`.
/// A requested live outpoint missing from `fetched` keeps the prior row (not marked spent).
pub fn merge_incremental_vtxo_snapshot(
    prior: &OffchainVtxoSnapshot,
    fetched: impl IntoIterator<Item = VirtualTxOutPoint>,
    requested_live_outpoints: &HashSet<OutPoint>,
    synced_at: i64,
    script_to_server_pk: impl Fn(&ScriptBuf) -> Option<XOnlyPublicKey>,
) -> OffchainVtxoSnapshot {
    let mut records_by_outpoint: HashMap<(String, u32), VirtualTxOutPointRecord> = prior
        .virtual_tx_outpoints
        .iter()
        .cloned()
        .map(|record| ((record.txid.clone(), record.vout), record))
        .collect();

    let mut fetched_outpoints = HashSet::new();
    for point in fetched {
        let outpoint = point.outpoint;
        fetched_outpoints.insert(outpoint);
        let outpoint_key = (outpoint.txid.to_string(), outpoint.vout);
        let prior_server_pk = records_by_outpoint
            .get(&outpoint_key)
            .and_then(|record| record.server_pk_hex.clone());
        let looked_up_pk = script_to_server_pk(&point.script);
        let server_pk = looked_up_pk.or_else(|| {
            prior_server_pk
                .as_deref()
                .and_then(|hex| XOnlyPublicKey::from_str(hex).ok())
        });
        let mut record = virtual_tx_outpoint_to_record(point, server_pk);
        if record.server_pk_hex.is_none() {
            record.server_pk_hex = prior_server_pk;
        }
        records_by_outpoint.insert(outpoint_key, record);
    }

    for outpoint in requested_live_outpoints {
        if fetched_outpoints.contains(outpoint) {
            continue;
        }
        let outpoint_key = (outpoint.txid.to_string(), outpoint.vout);
        let Some(prior_record) = prior
            .virtual_tx_outpoints
            .iter()
            .find(|record| record.txid == outpoint_key.0 && record.vout == outpoint_key.1)
        else {
            continue;
        };
        records_by_outpoint.insert(outpoint_key, prior_record.clone());
    }

    let mut virtual_tx_outpoints: Vec<VirtualTxOutPointRecord> =
        records_by_outpoint.into_values().collect();
    virtual_tx_outpoints
        .sort_by(|left, right| left.txid.cmp(&right.txid).then(left.vout.cmp(&right.vout)));

    OffchainVtxoSnapshot {
        synced_at,
        dust_sats: prior.dust_sats,
        virtual_tx_outpoints,
        unilateral_exit_materials_by_host_tx: prior.unilateral_exit_materials_by_host_tx.clone(),
        full_listed_at: prior.full_listed_at,
    }
}

/// Apply rows and materials that changed between `base` and `finalized` onto `latest`.
///
/// Unchanged historical VTXO rows stay on `latest`, so a concurrent full replace is not
/// overwritten by a light finalize that started from an older snapshot. Exit-material keys
/// removed between `base` and `finalized` are removed from `latest` too. Keys that only
/// `latest` has stay.
pub fn overlay_changed_vtxo_rows(
    latest: &OffchainVtxoSnapshot,
    base: &OffchainVtxoSnapshot,
    finalized: &OffchainVtxoSnapshot,
) -> OffchainVtxoSnapshot {
    let mut records_by_outpoint: HashMap<(String, u32), VirtualTxOutPointRecord> = latest
        .virtual_tx_outpoints
        .iter()
        .cloned()
        .map(|record| ((record.txid.clone(), record.vout), record))
        .collect();
    let base_by_outpoint: HashMap<(String, u32), &VirtualTxOutPointRecord> = base
        .virtual_tx_outpoints
        .iter()
        .map(|record| ((record.txid.clone(), record.vout), record))
        .collect();

    for record in &finalized.virtual_tx_outpoints {
        let key = (record.txid.clone(), record.vout);
        let changed = match base_by_outpoint.get(&key) {
            Some(base_record) => *base_record != record,
            None => true,
        };
        if changed {
            records_by_outpoint.insert(key, record.clone());
        }
    }

    let mut virtual_tx_outpoints: Vec<VirtualTxOutPointRecord> =
        records_by_outpoint.into_values().collect();
    virtual_tx_outpoints
        .sort_by(|left, right| left.txid.cmp(&right.txid).then(left.vout.cmp(&right.vout)));

    let materials = overlay_changed_exit_materials(
        &latest.unilateral_exit_materials_by_host_tx,
        &base.unilateral_exit_materials_by_host_tx,
        &finalized.unilateral_exit_materials_by_host_tx,
    );

    OffchainVtxoSnapshot {
        synced_at: finalized.synced_at,
        dust_sats: finalized.dust_sats,
        virtual_tx_outpoints,
        unilateral_exit_materials_by_host_tx: materials,
        full_listed_at: latest.full_listed_at.max(finalized.full_listed_at),
    }
}

fn overlay_changed_exit_materials(
    latest: &BTreeMap<String, UnilateralExitMaterialsRecord>,
    base: &BTreeMap<String, UnilateralExitMaterialsRecord>,
    finalized: &BTreeMap<String, UnilateralExitMaterialsRecord>,
) -> BTreeMap<String, UnilateralExitMaterialsRecord> {
    let mut materials = latest.clone();
    for (host_txid, materials_record) in finalized {
        if base
            .get(host_txid)
            .is_none_or(|base_record| base_record != materials_record)
        {
            materials.insert(host_txid.clone(), materials_record.clone());
        }
    }
    for host_txid in base.keys() {
        if !finalized.contains_key(host_txid) {
            materials.remove(host_txid);
        }
    }
    materials
}

/// Snapshot rows that still need an outpoint refresh (not yet spent).
pub fn live_snapshot_outpoints(snapshot: &OffchainVtxoSnapshot) -> Vec<OutPoint> {
    snapshot
        .virtual_tx_outpoints
        .iter()
        .filter(|record| !record.is_spent)
        .filter_map(|record| {
            let txid = Txid::from_str(&record.txid).ok()?;
            Some(OutPoint {
                txid,
                vout: record.vout,
            })
        })
        .collect()
}

/// Preserve local `is_unrolled` when ASP indexer lags after unilateral unroll.
///
/// `confirmed_unroll_host_txids` is independent evidence that unroll actually reached 6-conf
/// (host-tx observations or VTXO exit records at `unrolled+`). Tag-time records must not keep a
/// premature local stamp.
///
/// Only applies to VTXOs still present in the incoming operator list. Missing unrolled+ records
/// are handled by [`crate::session::unilateral_exit::watch_reconcile::reconcile_exiting_vtxo_records`].
pub fn confirmed_unroll_sticky_host_txids(
    observations: &BTreeMap<String, HostTxObservationRecord>,
    vtxo_exit_records: &BTreeMap<String, VtxoExitRecord>,
) -> HashSet<String> {
    let mut txids = HashSet::new();
    for (txid, observation) in observations {
        if observation.confirmations >= u64::from(UNILATERAL_EXIT_HOST_TX_CONFIRMATIONS) {
            txids.insert(txid.clone());
        }
    }
    for record in vtxo_exit_records.values() {
        if matches!(
            record.phase,
            VtxoExitPhase::Unrolled | VtxoExitPhase::CompleteReady
        ) {
            txids.insert(record.host_txid.clone());
        }
    }
    txids
}

pub fn merge_sticky_unrolled_flags(
    prior: Option<&OffchainVtxoSnapshot>,
    incoming: &mut OffchainVtxoSnapshot,
    confirmed_unroll_host_txids: &HashSet<String>,
) {
    let Some(prior) = prior else {
        return;
    };
    let prior_sticky_txids: HashSet<String> = prior
        .virtual_tx_outpoints
        .iter()
        .filter(|record| record.is_unrolled && !record.is_spent)
        .map(|record| record.txid.clone())
        .filter(|txid| confirmed_unroll_host_txids.contains(txid))
        .collect();

    for record in &mut incoming.virtual_tx_outpoints {
        if record.is_spent {
            continue;
        }
        if prior_sticky_txids.contains(&record.txid) {
            record.is_unrolled = true;
        }
    }
}

/// Drop indexer `is_unrolled` unless this wallet has already finalized that virtual tx.
///
/// arkd sets the flag when its scanner first sees the outpoint on chain. A settled boarding
/// output is not an unroll, and a real unroll is not `is_unrolled` here until 6 confirmations.
/// Call after [`merge_sticky_unrolled_flags`], which restores the flag for hosts in
/// `confirmed_unroll_host_txids`.
pub fn clear_indexer_unrolled_without_local_finality(
    incoming: &mut OffchainVtxoSnapshot,
    confirmed_unroll_host_txids: &HashSet<String>,
) {
    for record in &mut incoming.virtual_tx_outpoints {
        if record.is_spent || !record.is_unrolled {
            continue;
        }
        if !confirmed_unroll_host_txids.contains(&record.txid) {
            record.is_unrolled = false;
        }
    }
}

/// Preserve local `is_spent` when ASP indexer lags after on-chain completion.
pub fn merge_sticky_spent_flags(
    prior: Option<&OffchainVtxoSnapshot>,
    incoming: &mut OffchainVtxoSnapshot,
) {
    let Some(prior) = prior else {
        return;
    };
    for record in &mut incoming.virtual_tx_outpoints {
        let Some(prior_record) = prior.virtual_tx_outpoints.iter().find(|prior_record| {
            prior_record.txid == record.txid && prior_record.vout == record.vout
        }) else {
            continue;
        };
        if !prior_record.is_spent {
            continue;
        }
        record.is_spent = true;
        if record.spent_by.is_none() {
            record.spent_by = prior_record.spent_by.clone();
        }
    }
}

/// Mark every VTXO outpoint on a virtual tx as unrolled (all vouts on the same host tx).
pub(crate) fn mark_virtual_tx_vtxos_unrolled_in_snapshot(
    snapshot: &mut OffchainVtxoSnapshot,
    txid: &str,
) {
    for record in &mut snapshot.virtual_tx_outpoints {
        if record.txid == txid {
            record.is_unrolled = true;
        }
    }
}

/// Drop a premature local `is_unrolled` stamp when this host has not reached 6-conf finality.
pub(crate) fn clear_virtual_tx_vtxos_unrolled_in_snapshot(
    snapshot: &mut OffchainVtxoSnapshot,
    txid: &str,
) {
    for record in &mut snapshot.virtual_tx_outpoints {
        if record.txid == txid {
            record.is_unrolled = false;
        }
    }
}

pub fn local_snapshot_record_for_outpoint<'a>(
    snapshot: &'a OffchainVtxoSnapshot,
    txid: &Txid,
    vout: u32,
) -> Option<&'a crate::persistence::VirtualTxOutPointRecord> {
    snapshot
        .virtual_tx_outpoints
        .iter()
        .find(|record| record.txid == txid.to_string() && record.vout == vout)
}

/// Overlay persisted snapshot flags onto operator/live VTXO rows (e.g. Esplora-healed `is_spent`).
pub fn apply_local_snapshot_flags_to_vtxo(
    virtual_tx_outpoint: &mut VirtualTxOutPoint,
    record: &crate::persistence::VirtualTxOutPointRecord,
) {
    if record.is_unrolled {
        virtual_tx_outpoint.is_unrolled = true;
    }
    if record.is_spent {
        virtual_tx_outpoint.is_spent = true;
        if virtual_tx_outpoint.spent_by.is_none() {
            virtual_tx_outpoint.spent_by = record
                .spent_by
                .as_ref()
                .and_then(|spent_by| Txid::from_str(spent_by).ok());
        }
    }
}

fn virtual_tx_outpoint_to_record(
    point: VirtualTxOutPoint,
    server_pk: Option<XOnlyPublicKey>,
) -> VirtualTxOutPointRecord {
    VirtualTxOutPointRecord {
        txid: point.outpoint.txid.to_string(),
        vout: point.outpoint.vout,
        created_at: point.created_at,
        expires_at: point.expires_at,
        amount_sats: point.amount.to_sat(),
        script_hex: point.script.to_bytes().to_lower_hex_string(),
        is_preconfirmed: point.is_preconfirmed,
        is_swept: point.is_swept,
        is_unrolled: point.is_unrolled,
        is_spent: point.is_spent,
        spent_by: point.spent_by.map(|txid| txid.to_string()),
        commitment_txids: point
            .commitment_txids
            .iter()
            .map(|txid| txid.to_string())
            .collect(),
        settled_by: point.settled_by.map(|txid| txid.to_string()),
        ark_txid: point.ark_txid.map(|txid| txid.to_string()),
        assets: point
            .assets
            .iter()
            .map(|asset| VirtualTxOutPointAssetRecord {
                asset_id_hex: asset.asset_id.to_string(),
                amount: asset.amount,
            })
            .collect(),
        server_pk_hex: server_pk.map(|pk| pk.to_string()),
    }
}

pub(crate) fn virtual_tx_outpoint_from_record(
    record: &VirtualTxOutPointRecord,
) -> ArkResult<VirtualTxOutPoint> {
    let txid = Txid::from_str(&record.txid)
        .map_err(|error| ArkWasmError::Snapshot(format!("invalid vtxo txid: {error}")))?;
    let script_bytes = Vec::from_hex(&record.script_hex)
        .map_err(|error| ArkWasmError::Snapshot(format!("invalid vtxo script: {error}")))?;
    let script = ScriptBuf::from_bytes(script_bytes);

    Ok(VirtualTxOutPoint {
        outpoint: OutPoint {
            txid,
            vout: record.vout,
        },
        created_at: record.created_at,
        expires_at: record.expires_at,
        amount: Amount::from_sat(record.amount_sats),
        script,
        is_preconfirmed: record.is_preconfirmed,
        is_swept: record.is_swept,
        is_unrolled: record.is_unrolled,
        is_spent: record.is_spent,
        spent_by: record
            .spent_by
            .as_ref()
            .map(|value| Txid::from_str(value))
            .transpose()
            .map_err(|error| ArkWasmError::Snapshot(format!("invalid spent_by: {error}")))?,
        commitment_txids: record
            .commitment_txids
            .iter()
            .map(|value| Txid::from_str(value))
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| ArkWasmError::Snapshot(format!("invalid commitment txid: {error}")))?,
        settled_by: record
            .settled_by
            .as_ref()
            .map(|value| Txid::from_str(value))
            .transpose()
            .map_err(|error| ArkWasmError::Snapshot(format!("invalid settled_by: {error}")))?,
        ark_txid: record
            .ark_txid
            .as_ref()
            .map(|value| Txid::from_str(value))
            .transpose()
            .map_err(|error| ArkWasmError::Snapshot(format!("invalid ark txid: {error}")))?,
        assets: record
            .assets
            .iter()
            .map(|asset| {
                let asset_id = asset.asset_id_hex.parse().map_err(|error| {
                    ArkWasmError::Snapshot(format!("invalid asset id: {error}"))
                })?;
                Ok(ark_core::server::Asset {
                    asset_id,
                    amount: asset.amount,
                })
            })
            .collect::<Result<Vec<_>, ArkWasmError>>()?,
    })
}

fn generate_incoming_vtxo_transaction_history(
    unspendable_outpoints: &[VirtualTxOutPoint],
    unspent_outpoints: &[VirtualTxOutPoint],
    boarding_commitment_transactions: &[Txid],
) -> ArkResult<Vec<Transaction>> {
    history::generate_incoming_vtxo_transaction_history(
        unspendable_outpoints,
        unspent_outpoints,
        boarding_commitment_transactions,
    )
    .map_err(ArkWasmError::from)
}

fn generate_outgoing_vtxo_transaction_history(
    unspendable_outpoints: &[VirtualTxOutPoint],
    unspent_outpoints: &[VirtualTxOutPoint],
) -> ArkResult<Vec<OutgoingTransaction>> {
    history::generate_outgoing_vtxo_transaction_history(unspendable_outpoints, unspent_outpoints)
        .map_err(ArkWasmError::from)
        .map(|iterator| iterator.collect())
}

#[cfg(test)]
mod tests {
    use super::{
        clear_indexer_unrolled_without_local_finality, live_snapshot_outpoints,
        mark_virtual_tx_vtxos_unrolled_in_snapshot, merge_incremental_vtxo_snapshot,
        merge_sticky_spent_flags, merge_sticky_unrolled_flags,
        offchain_balance_buckets_from_snapshot, offchain_balance_sats_from_snapshot,
        overlay_changed_vtxo_rows, snapshot_from_virtual_tx_outpoints,
        snapshot_from_virtual_tx_outpoints_with_script_lookup, vtxo_list_from_snapshot,
    };
    use crate::error::ArkWasmError;
    use crate::persistence::{
        OffchainVtxoSnapshot, UnilateralExitMaterialsRecord, VirtualTxOutPointRecord,
    };
    use ark_core::server::VirtualTxOutPoint;
    use ark_core::server::{DeprecatedSigner, Info};
    use bitcoin::Amount;
    use bitcoin::Network;
    use bitcoin::OutPoint;
    use bitcoin::ScriptBuf;
    use bitcoin::Txid;
    use bitcoin::hashes::Hash;
    use bitcoin::secp256k1::PublicKey;
    use std::collections::BTreeMap;
    use std::collections::HashMap;
    use std::collections::HashSet;
    use std::str::FromStr;

    fn sample_vtp(
        txid_byte: u8,
        amount_sats: u64,
        is_preconfirmed: bool,
        expires_at: i64,
    ) -> VirtualTxOutPoint {
        VirtualTxOutPoint {
            outpoint: OutPoint::new(Txid::from_byte_array([txid_byte; 32]), 0),
            created_at: expires_at - 86_400,
            expires_at,
            amount: Amount::from_sat(amount_sats),
            script: ScriptBuf::new(),
            is_preconfirmed,
            is_swept: false,
            is_unrolled: false,
            is_spent: false,
            spent_by: None,
            commitment_txids: vec![],
            settled_by: None,
            ark_txid: None,
            assets: vec![],
        }
    }

    fn sample_snapshot_record(txid: &str, vout: u32, amount_sats: u64) -> VirtualTxOutPointRecord {
        VirtualTxOutPointRecord {
            txid: txid.to_string(),
            vout,
            created_at: 0,
            expires_at: 9_999_999_999,
            amount_sats,
            script_hex: String::new(),
            is_preconfirmed: false,
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

    fn snapshot_from_records(records: Vec<VirtualTxOutPointRecord>) -> OffchainVtxoSnapshot {
        OffchainVtxoSnapshot {
            synced_at: 1_700_000_000,
            dust_sats: 330,
            virtual_tx_outpoints: records,
            unilateral_exit_materials_by_host_tx: BTreeMap::new(),
            full_listed_at: 100,
        }
    }

    #[test]
    fn upsert_keeps_prior_spent_history_and_adds_spendable() {
        let spent_txid = Txid::from_byte_array([0x11; 32]).to_string();
        let mut spent = sample_snapshot_record(&spent_txid, 0, 1_000);
        spent.is_spent = true;
        let prior = snapshot_from_records(vec![spent]);
        let incoming = sample_vtp(0x22, 25_000, false, 9_999_999_999);
        let merged = merge_incremental_vtxo_snapshot(
            &prior,
            vec![incoming.clone()],
            &HashSet::new(),
            50,
            |_| None,
        );
        assert_eq!(merged.synced_at, 50);
        assert_eq!(merged.full_listed_at, 100);
        assert_eq!(merged.virtual_tx_outpoints.len(), 2);
        assert!(
            merged
                .virtual_tx_outpoints
                .iter()
                .any(|record| record.txid == spent_txid && record.is_spent)
        );
        assert!(merged.virtual_tx_outpoints.iter().any(|record| {
            record.txid == incoming.outpoint.txid.to_string()
                && !record.is_spent
                && record.amount_sats == 25_000
        }));
    }

    #[test]
    fn merge_marks_live_row_spent_from_outpoint_fetch() {
        let txid = Txid::from_byte_array([0x33; 32]);
        let live = sample_snapshot_record(&txid.to_string(), 0, 40_000);
        let prior = snapshot_from_records(vec![live]);
        let mut fetched = sample_vtp(0x33, 40_000, false, 9_999_999_999);
        fetched.is_spent = true;
        fetched.spent_by = Some(Txid::from_byte_array([0x44; 32]));
        let requested = HashSet::from([OutPoint::new(txid, 0)]);
        let merged =
            merge_incremental_vtxo_snapshot(&prior, vec![fetched], &requested, 51, |_| None);
        assert_eq!(merged.virtual_tx_outpoints.len(), 1);
        assert!(merged.virtual_tx_outpoints[0].is_spent);
        let spent_by = Txid::from_byte_array([0x44; 32]).to_string();
        assert_eq!(
            merged.virtual_tx_outpoints[0].spent_by.as_deref(),
            Some(spent_by.as_str())
        );
    }

    #[test]
    fn merge_keeps_prior_row_when_requested_live_outpoint_absent_from_nonempty_fetch() {
        let kept_txid = Txid::from_byte_array([0x55; 32]);
        let live = sample_snapshot_record(&kept_txid.to_string(), 0, 12_000);
        let prior = snapshot_from_records(vec![live]);
        let other = sample_vtp(0x56, 3_000, false, 9_999_999_999);
        let requested = HashSet::from([OutPoint::new(kept_txid, 0)]);
        let merged = merge_incremental_vtxo_snapshot(&prior, vec![other], &requested, 52, |_| None);
        assert_eq!(merged.virtual_tx_outpoints.len(), 2);
        let kept = merged
            .virtual_tx_outpoints
            .iter()
            .find(|record| record.txid == kept_txid.to_string())
            .expect("requested live outpoint");
        assert!(!kept.is_spent);
        assert_eq!(kept.amount_sats, 12_000);
    }

    #[test]
    fn merge_preserves_swept_and_preconfirmed_from_outpoint_refresh() {
        let txid = Txid::from_byte_array([0x66; 32]);
        let live = sample_snapshot_record(&txid.to_string(), 0, 8_000);
        let prior = snapshot_from_records(vec![live]);
        let mut fetched = sample_vtp(0x66, 8_000, true, 9_999_999_999);
        fetched.is_swept = true;
        let requested = HashSet::from([OutPoint::new(txid, 0)]);
        let merged =
            merge_incremental_vtxo_snapshot(&prior, vec![fetched], &requested, 53, |_| None);
        assert!(merged.virtual_tx_outpoints[0].is_preconfirmed);
        assert!(merged.virtual_tx_outpoints[0].is_swept);
        assert!(!merged.virtual_tx_outpoints[0].is_spent);
    }

    #[test]
    fn catch_up_merge_after_full_replace_keeps_live_row_absent_from_full_list() {
        let historical_txid = Txid::from_byte_array([0x77; 32]).to_string();
        let mut historical = sample_snapshot_record(&historical_txid, 0, 1_000);
        historical.is_spent = true;
        let boarded = sample_vtp(0x88, 50_000, true, 9_999_999_999);
        let replaced = snapshot_from_records(vec![historical]);
        let merged = merge_incremental_vtxo_snapshot(
            &replaced,
            vec![boarded.clone()],
            &HashSet::new(),
            54,
            |_| None,
        );
        assert!(
            merged
                .virtual_tx_outpoints
                .iter()
                .any(|record| record.txid == historical_txid && record.is_spent)
        );
        assert!(merged.virtual_tx_outpoints.iter().any(|record| {
            record.txid == boarded.outpoint.txid.to_string() && record.amount_sats == 50_000
        }));
    }

    #[test]
    fn live_snapshot_outpoints_skips_spent_rows() {
        let live_txid = Txid::from_byte_array([0x99; 32]);
        let spent_txid = Txid::from_byte_array([0xaa; 32]).to_string();
        let mut spent = sample_snapshot_record(&spent_txid, 0, 1_000);
        spent.is_spent = true;
        let snapshot = snapshot_from_records(vec![
            sample_snapshot_record(&live_txid.to_string(), 1, 2_000),
            spent,
        ]);
        let live = live_snapshot_outpoints(&snapshot);
        assert_eq!(live, vec![OutPoint::new(live_txid, 1)]);
    }

    fn sample_exit_materials(cached_at: i64) -> UnilateralExitMaterialsRecord {
        UnilateralExitMaterialsRecord {
            cached_at,
            chain_json: "{}".to_string(),
            virtual_psbts: vec![],
        }
    }

    fn snapshot_with_exit_materials(
        records: Vec<VirtualTxOutPointRecord>,
        host_txid: &str,
        materials: UnilateralExitMaterialsRecord,
    ) -> OffchainVtxoSnapshot {
        let mut snapshot = snapshot_from_records(records);
        snapshot
            .unilateral_exit_materials_by_host_tx
            .insert(host_txid.to_string(), materials);
        snapshot
    }

    #[test]
    fn overlay_drops_exit_materials_pruned_between_base_and_finalized() {
        let host_txid = Txid::from_byte_array([0xb1; 32]).to_string();
        let record = sample_snapshot_record(&host_txid, 0, 40_000);
        let base = snapshot_with_exit_materials(
            vec![record.clone()],
            &host_txid,
            sample_exit_materials(1),
        );
        let latest = snapshot_with_exit_materials(
            vec![record.clone()],
            &host_txid,
            sample_exit_materials(2),
        );
        let finalized = snapshot_from_records(vec![record]);

        let overlaid = overlay_changed_vtxo_rows(&latest, &base, &finalized);

        assert!(
            !overlaid
                .unilateral_exit_materials_by_host_tx
                .contains_key(&host_txid),
            "prune between base and finalized must drop exit materials on latest"
        );
    }

    #[test]
    fn overlay_keeps_exit_materials_latest_added_outside_this_sync() {
        let concurrent_host = Txid::from_byte_array([0xb2; 32]).to_string();
        let base = snapshot_from_records(vec![]);
        let mut latest = snapshot_from_records(vec![]);
        latest
            .unilateral_exit_materials_by_host_tx
            .insert(concurrent_host.clone(), sample_exit_materials(3));
        let finalized = snapshot_from_records(vec![]);

        let overlaid = overlay_changed_vtxo_rows(&latest, &base, &finalized);

        assert_eq!(
            overlaid
                .unilateral_exit_materials_by_host_tx
                .get(&concurrent_host)
                .map(|materials| materials.cached_at),
            Some(3)
        );
    }

    #[test]
    fn overlay_keeps_historical_vtxo_row_missing_from_finalized() {
        let historical_txid = Txid::from_byte_array([0xb3; 32]).to_string();
        let mut historical = sample_snapshot_record(&historical_txid, 0, 1_000);
        historical.is_spent = true;
        let base = snapshot_from_records(vec![]);
        let latest = snapshot_from_records(vec![historical.clone()]);
        let finalized = snapshot_from_records(vec![]);

        let overlaid = overlay_changed_vtxo_rows(&latest, &base, &finalized);

        assert_eq!(overlaid.virtual_tx_outpoints, vec![historical]);
    }

    #[test]
    fn overlay_leaves_row_unchanged_when_finalize_matches_base() {
        let txid = Txid::from_byte_array([0xb4; 32]).to_string();
        let settled = sample_snapshot_record(&txid, 0, 50_000);
        let base = snapshot_from_records(vec![settled.clone()]);
        let latest = base.clone();
        let mut finalized = base.clone();
        finalized.synced_at = 60;

        let overlaid = overlay_changed_vtxo_rows(&latest, &base, &finalized);

        assert!(!overlaid.virtual_tx_outpoints[0].is_unrolled);
        assert_eq!(overlaid.synced_at, 60);
    }

    #[test]
    fn mark_virtual_tx_vtxos_unrolled_co_marks_all_vouts_on_tx() {
        let txid = Txid::from_byte_array([0x88; 32]).to_string();
        let mut snapshot = OffchainVtxoSnapshot {
            synced_at: 1,
            dust_sats: 330,
            virtual_tx_outpoints: vec![
                sample_snapshot_record(&txid, 0, 50_000),
                sample_snapshot_record(&txid, 1, 25_000),
            ],
            unilateral_exit_materials_by_host_tx: BTreeMap::new(),
            full_listed_at: 0,
        };

        mark_virtual_tx_vtxos_unrolled_in_snapshot(&mut snapshot, &txid);

        assert!(
            snapshot
                .virtual_tx_outpoints
                .iter()
                .all(|record| record.is_unrolled)
        );
    }

    #[test]
    fn merge_sticky_unrolled_preserves_flag_when_asp_lags() {
        let txid = Txid::from_byte_array([0x42; 32]).to_string();
        let prior = OffchainVtxoSnapshot {
            synced_at: 1,
            dust_sats: 330,
            virtual_tx_outpoints: vec![VirtualTxOutPointRecord {
                txid: txid.clone(),
                vout: 0,
                created_at: 0,
                expires_at: 9_999_999_999,
                amount_sats: 50_000,
                script_hex: String::new(),
                is_preconfirmed: false,
                is_swept: false,
                is_unrolled: true,
                is_spent: false,
                spent_by: None,
                commitment_txids: vec![],
                settled_by: None,
                ark_txid: None,
                assets: vec![],
                server_pk_hex: None,
            }],
            unilateral_exit_materials_by_host_tx: BTreeMap::new(),
            full_listed_at: 0,
        };
        let mut incoming = snapshot_from_virtual_tx_outpoints(
            330,
            2,
            vec![VirtualTxOutPoint {
                outpoint: OutPoint::new(Txid::from_str(&txid).expect("txid"), 0),
                created_at: 0,
                expires_at: 9_999_999_999,
                amount: Amount::from_sat(50_000),
                script: ScriptBuf::new(),
                is_preconfirmed: false,
                is_swept: false,
                is_unrolled: false,
                is_spent: false,
                spent_by: None,
                commitment_txids: vec![],
                settled_by: None,
                ark_txid: None,
                assets: vec![],
            }],
        );

        merge_sticky_unrolled_flags(Some(&prior), &mut incoming, &HashSet::from([txid.clone()]));
        assert!(incoming.virtual_tx_outpoints[0].is_unrolled);
    }

    #[test]
    fn confirmed_unroll_sticky_host_txids_include_unrolled_records_without_watches() {
        let host = Txid::from_byte_array([0x47; 32]).to_string();
        let mut records = BTreeMap::new();
        records.insert(
            crate::persistence::vtxo_exit_record_key(&host, 0),
            crate::persistence::VtxoExitRecord {
                phase: crate::persistence::VtxoExitPhase::Unrolled,
                tagged_at: 1,
                host_txid: host.clone(),
                amount_sats: 50_000,
            },
        );
        let sticky = super::confirmed_unroll_sticky_host_txids(&BTreeMap::new(), &records);
        assert!(sticky.contains(&host));
    }

    #[test]
    fn merge_sticky_unrolled_does_not_preserve_without_confirmed_host() {
        let txid = Txid::from_byte_array([0x46; 32]).to_string();
        let prior = OffchainVtxoSnapshot {
            synced_at: 1,
            dust_sats: 330,
            virtual_tx_outpoints: vec![VirtualTxOutPointRecord {
                txid: txid.clone(),
                vout: 0,
                created_at: 0,
                expires_at: 9_999_999_999,
                amount_sats: 50_000,
                script_hex: String::new(),
                is_preconfirmed: false,
                is_swept: false,
                is_unrolled: true,
                is_spent: false,
                spent_by: None,
                commitment_txids: vec![],
                settled_by: None,
                ark_txid: None,
                assets: vec![],
                server_pk_hex: None,
            }],
            unilateral_exit_materials_by_host_tx: BTreeMap::new(),
            full_listed_at: 0,
        };
        let mut incoming = snapshot_from_virtual_tx_outpoints(
            330,
            2,
            vec![VirtualTxOutPoint {
                outpoint: OutPoint::new(Txid::from_str(&txid).expect("txid"), 0),
                created_at: 0,
                expires_at: 9_999_999_999,
                amount: Amount::from_sat(50_000),
                script: ScriptBuf::new(),
                is_preconfirmed: false,
                is_swept: false,
                is_unrolled: false,
                is_spent: false,
                spent_by: None,
                commitment_txids: vec![],
                settled_by: None,
                ark_txid: None,
                assets: vec![],
            }],
        );

        merge_sticky_unrolled_flags(Some(&prior), &mut incoming, &HashSet::new());
        assert!(!incoming.virtual_tx_outpoints[0].is_unrolled);
    }

    #[test]
    fn merge_sticky_unrolled_promotes_all_vouts_on_same_host_tx() {
        let txid = Txid::from_byte_array([0x45; 32]).to_string();
        let prior = OffchainVtxoSnapshot {
            synced_at: 1,
            dust_sats: 330,
            virtual_tx_outpoints: vec![VirtualTxOutPointRecord {
                txid: txid.clone(),
                vout: 0,
                created_at: 0,
                expires_at: 9_999_999_999,
                amount_sats: 50_000,
                script_hex: String::new(),
                is_preconfirmed: false,
                is_swept: false,
                is_unrolled: true,
                is_spent: false,
                spent_by: None,
                commitment_txids: vec![],
                settled_by: None,
                ark_txid: None,
                assets: vec![],
                server_pk_hex: None,
            }],
            unilateral_exit_materials_by_host_tx: BTreeMap::new(),
            full_listed_at: 0,
        };
        let mut incoming = snapshot_from_virtual_tx_outpoints(
            330,
            2,
            vec![
                VirtualTxOutPoint {
                    outpoint: OutPoint::new(Txid::from_str(&txid).expect("txid"), 0),
                    created_at: 0,
                    expires_at: 9_999_999_999,
                    amount: Amount::from_sat(50_000),
                    script: ScriptBuf::new(),
                    is_preconfirmed: false,
                    is_swept: false,
                    is_unrolled: false,
                    is_spent: false,
                    spent_by: None,
                    commitment_txids: vec![],
                    settled_by: None,
                    ark_txid: None,
                    assets: vec![],
                },
                VirtualTxOutPoint {
                    outpoint: OutPoint::new(Txid::from_str(&txid).expect("txid"), 1),
                    created_at: 0,
                    expires_at: 9_999_999_999,
                    amount: Amount::from_sat(25_000),
                    script: ScriptBuf::new(),
                    is_preconfirmed: false,
                    is_swept: false,
                    is_unrolled: false,
                    is_spent: false,
                    spent_by: None,
                    commitment_txids: vec![],
                    settled_by: None,
                    ark_txid: None,
                    assets: vec![],
                },
            ],
        );

        merge_sticky_unrolled_flags(Some(&prior), &mut incoming, &HashSet::from([txid.clone()]));
        assert!(
            incoming
                .virtual_tx_outpoints
                .iter()
                .all(|record| record.is_unrolled)
        );
    }

    #[test]
    fn merge_sticky_unrolled_clears_when_operator_reports_spent() {
        let txid = Txid::from_byte_array([0x43; 32]).to_string();
        let prior = OffchainVtxoSnapshot {
            synced_at: 1,
            dust_sats: 330,
            virtual_tx_outpoints: vec![VirtualTxOutPointRecord {
                txid: txid.clone(),
                vout: 0,
                created_at: 0,
                expires_at: 9_999_999_999,
                amount_sats: 50_000,
                script_hex: String::new(),
                is_preconfirmed: false,
                is_swept: false,
                is_unrolled: true,
                is_spent: false,
                spent_by: None,
                commitment_txids: vec![],
                settled_by: None,
                ark_txid: None,
                assets: vec![],
                server_pk_hex: None,
            }],
            unilateral_exit_materials_by_host_tx: BTreeMap::new(),
            full_listed_at: 0,
        };
        let mut incoming = snapshot_from_virtual_tx_outpoints(
            330,
            2,
            vec![VirtualTxOutPoint {
                outpoint: OutPoint::new(Txid::from_str(&txid).expect("txid"), 0),
                created_at: 0,
                expires_at: 9_999_999_999,
                amount: Amount::from_sat(50_000),
                script: ScriptBuf::new(),
                is_preconfirmed: false,
                is_swept: false,
                is_unrolled: false,
                is_spent: true,
                spent_by: None,
                commitment_txids: vec![],
                settled_by: None,
                ark_txid: None,
                assets: vec![],
            }],
        );

        merge_sticky_unrolled_flags(Some(&prior), &mut incoming, &HashSet::from([txid.clone()]));
        assert!(!incoming.virtual_tx_outpoints[0].is_unrolled);
    }

    #[test]
    fn fresh_board_drops_indexer_unrolled_without_local_finality() {
        let boarded_txid = Txid::from_byte_array([0x71; 32]).to_string();
        let mut incoming = snapshot_from_virtual_tx_outpoints(
            330,
            2,
            vec![VirtualTxOutPoint {
                outpoint: OutPoint::new(Txid::from_str(&boarded_txid).expect("txid"), 0),
                created_at: 0,
                expires_at: 9_999_999_999,
                amount: Amount::from_sat(50_000),
                script: ScriptBuf::new(),
                is_preconfirmed: false,
                is_swept: false,
                is_unrolled: true,
                is_spent: false,
                spent_by: None,
                commitment_txids: vec![],
                settled_by: None,
                ark_txid: None,
                assets: vec![],
            }],
        );

        clear_indexer_unrolled_without_local_finality(&mut incoming, &HashSet::new());
        assert!(!incoming.virtual_tx_outpoints[0].is_unrolled);
    }

    #[test]
    fn indexer_unrolled_stays_when_host_already_reached_local_finality() {
        let txid = Txid::from_byte_array([0x72; 32]).to_string();
        let mut incoming = snapshot_from_virtual_tx_outpoints(
            330,
            2,
            vec![VirtualTxOutPoint {
                outpoint: OutPoint::new(Txid::from_str(&txid).expect("txid"), 0),
                created_at: 0,
                expires_at: 9_999_999_999,
                amount: Amount::from_sat(50_000),
                script: ScriptBuf::new(),
                is_preconfirmed: false,
                is_swept: false,
                is_unrolled: true,
                is_spent: false,
                spent_by: None,
                commitment_txids: vec![],
                settled_by: None,
                ark_txid: None,
                assets: vec![],
            }],
        );

        clear_indexer_unrolled_without_local_finality(
            &mut incoming,
            &HashSet::from([txid.clone()]),
        );
        assert!(incoming.virtual_tx_outpoints[0].is_unrolled);
    }

    #[test]
    fn merge_sticky_spent_preserves_flag_when_asp_lags() {
        let txid = Txid::from_byte_array([0x51; 32]).to_string();
        let completion_txid = Txid::from_byte_array([0x99; 32]).to_string();
        let prior = OffchainVtxoSnapshot {
            synced_at: 1,
            dust_sats: 330,
            virtual_tx_outpoints: vec![VirtualTxOutPointRecord {
                txid: txid.clone(),
                vout: 0,
                created_at: 0,
                expires_at: 9_999_999_999,
                amount_sats: 50_000,
                script_hex: String::new(),
                is_preconfirmed: false,
                is_swept: false,
                is_unrolled: true,
                is_spent: true,
                spent_by: Some(completion_txid.clone()),
                commitment_txids: vec![],
                settled_by: None,
                ark_txid: None,
                assets: vec![],
                server_pk_hex: None,
            }],
            unilateral_exit_materials_by_host_tx: BTreeMap::new(),
            full_listed_at: 0,
        };
        let mut incoming = snapshot_from_virtual_tx_outpoints(
            330,
            2,
            vec![VirtualTxOutPoint {
                outpoint: OutPoint::new(Txid::from_str(&txid).expect("txid"), 0),
                created_at: 0,
                expires_at: 9_999_999_999,
                amount: Amount::from_sat(50_000),
                script: ScriptBuf::new(),
                is_preconfirmed: false,
                is_swept: false,
                is_unrolled: true,
                is_spent: false,
                spent_by: None,
                commitment_txids: vec![],
                settled_by: None,
                ark_txid: None,
                assets: vec![],
            }],
        );

        merge_sticky_spent_flags(Some(&prior), &mut incoming);
        assert!(incoming.virtual_tx_outpoints[0].is_spent);
        assert_eq!(
            incoming.virtual_tx_outpoints[0].spent_by.as_deref(),
            Some(completion_txid.as_str())
        );
    }

    #[test]
    fn offchain_balance_sats_from_snapshot_buckets() {
        let future_expiry = 2_000_000_000_i64;
        let past_expiry = 1_000_000_000_i64;
        let snapshot = snapshot_from_virtual_tx_outpoints(
            330,
            1_700_000_000,
            vec![
                sample_vtp(1, 10_000, true, future_expiry),
                sample_vtp(2, 20_000, false, future_expiry),
                sample_vtp(3, 5_000, false, past_expiry),
            ],
        );

        let (pre_confirmed, confirmed, recoverable) =
            offchain_balance_sats_from_snapshot(&snapshot).expect("balance buckets");

        assert_eq!(pre_confirmed, 10_000);
        assert_eq!(confirmed, 20_000);
        assert_eq!(recoverable, 5_000);
    }

    #[test]
    fn snapshot_round_trip_preserves_vtxo_fields() {
        let original = sample_vtp(9, 180_603, false, 1_900_000_000);
        let snapshot =
            snapshot_from_virtual_tx_outpoints(330, 1_700_000_000, vec![original.clone()]);
        let vtxo_list = vtxo_list_from_snapshot(&snapshot).expect("vtxo list");
        let round_tripped = vtxo_list
            .all_unspent()
            .find(|vtp| vtp.outpoint == original.outpoint)
            .expect("round-tripped vtxo");

        assert_eq!(round_tripped.amount, original.amount);
        assert_eq!(round_tripped.expires_at, original.expires_at);
        assert_eq!(round_tripped.is_preconfirmed, original.is_preconfirmed);
    }

    #[test]
    fn snapshot_round_trip_preserves_server_pk_hex() {
        let script = ScriptBuf::from_bytes(vec![0x51]);
        let future_expiry = 2_000_000_000_i64;
        let original = VirtualTxOutPoint {
            outpoint: OutPoint::new(Txid::from_byte_array([9; 32]), 0),
            created_at: future_expiry - 86_400,
            expires_at: future_expiry,
            amount: Amount::from_sat(50_000),
            script: script.clone(),
            is_preconfirmed: false,
            is_swept: false,
            is_unrolled: false,
            is_spent: false,
            spent_by: None,
            commitment_txids: vec![],
            settled_by: None,
            ark_txid: None,
            assets: vec![],
        };
        let deprecated_pk = PublicKey::from_str(
            "02c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5",
        )
        .expect("valid key")
        .x_only_public_key()
        .0;
        let snapshot = snapshot_from_virtual_tx_outpoints_with_script_lookup(
            330,
            1_700_000_000,
            vec![original],
            |lookup_script| {
                if lookup_script == &script {
                    Some(deprecated_pk)
                } else {
                    None
                }
            },
        );

        assert_eq!(
            snapshot.virtual_tx_outpoints[0].server_pk_hex.as_deref(),
            Some(deprecated_pk.to_string().as_str())
        );
    }

    #[test]
    fn offchain_balance_buckets_from_snapshot_matches_signer_aware_buckets() {
        let script = ScriptBuf::from_bytes(vec![0x51]);
        let future_expiry = 2_000_000_000_i64;
        let vtxo = VirtualTxOutPoint {
            outpoint: OutPoint::new(Txid::from_byte_array([7; 32]), 0),
            created_at: future_expiry - 86_400,
            expires_at: future_expiry,
            amount: Amount::from_sat(50_000),
            script: script.clone(),
            is_preconfirmed: false,
            is_swept: false,
            is_unrolled: false,
            is_spent: false,
            spent_by: None,
            commitment_txids: vec![],
            settled_by: None,
            ark_txid: None,
            assets: vec![],
        };
        let deprecated_pk = PublicKey::from_str(
            "02c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5",
        )
        .expect("valid key")
        .x_only_public_key()
        .0;
        let snapshot = snapshot_from_virtual_tx_outpoints_with_script_lookup(
            330,
            1_000_000,
            vec![vtxo],
            |lookup_script| {
                if lookup_script == &script {
                    Some(deprecated_pk)
                } else {
                    None
                }
            },
        );
        let server_info = test_server_info_for_snapshot(
            "0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798",
            vec![(
                "02c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5",
                500_000,
            )],
        );
        let buckets = offchain_balance_buckets_from_snapshot(
            &snapshot,
            &server_info,
            1_000_000,
            None,
            &BTreeMap::new(),
        )
        .expect("snapshot buckets");

        assert_eq!(buckets.confirmed_sats, 0);
        assert_eq!(buckets.pending_recovery_due_to_expired_signer_sats, 50_000);
    }

    #[test]
    fn pending_recovery_due_to_expired_signer_excludes_pipeline_not_funding_lost() {
        use crate::persistence::{VtxoExitPhase, VtxoExitRecord, vtxo_exit_record_key};

        let script = ScriptBuf::from_bytes(vec![0x51]);
        let future_expiry = 2_000_000_000_i64;
        let txid = Txid::from_byte_array([7; 32]).to_string();
        let vtxo = VirtualTxOutPoint {
            outpoint: OutPoint::new(Txid::from_byte_array([7; 32]), 0),
            created_at: future_expiry - 86_400,
            expires_at: future_expiry,
            amount: Amount::from_sat(50_000),
            script: script.clone(),
            is_preconfirmed: false,
            is_swept: false,
            is_unrolled: false,
            is_spent: false,
            spent_by: None,
            commitment_txids: vec![],
            settled_by: None,
            ark_txid: None,
            assets: vec![],
        };
        let deprecated_pk = PublicKey::from_str(
            "02c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5",
        )
        .expect("valid key")
        .x_only_public_key()
        .0;
        let snapshot = snapshot_from_virtual_tx_outpoints_with_script_lookup(
            330,
            1_000_000,
            vec![vtxo],
            |lookup_script| {
                if lookup_script == &script {
                    Some(deprecated_pk)
                } else {
                    None
                }
            },
        );
        let server_info = test_server_info_for_snapshot(
            "0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798",
            vec![(
                "02c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5",
                500_000,
            )],
        );
        for (phase, expected_pending_sats) in [
            (VtxoExitPhase::Tagged, 0_u64),
            (VtxoExitPhase::FundingLost, 50_000_u64),
        ] {
            let mut records = BTreeMap::new();
            records.insert(
                vtxo_exit_record_key(&txid, 0),
                VtxoExitRecord {
                    phase,
                    tagged_at: 1_000_000,
                    host_txid: txid.clone(),
                    amount_sats: 50_000,
                },
            );
            let buckets = offchain_balance_buckets_from_snapshot(
                &snapshot,
                &server_info,
                1_000_000,
                None,
                &records,
            )
            .expect("snapshot buckets");

            assert_eq!(
                buckets.pending_recovery_due_to_expired_signer_sats, expected_pending_sats,
                "{phase:?} pending recovery must follow pipeline exclude, not spend-lock"
            );
        }
    }

    #[test]
    fn empty_vtxo_exit_records_do_not_revive_pending_as_in_progress() {
        let script = ScriptBuf::from_bytes(vec![0x51]);
        let future_expiry = 2_000_000_000_i64;
        let vtxo = VirtualTxOutPoint {
            outpoint: OutPoint::new(Txid::from_byte_array([7; 32]), 0),
            created_at: future_expiry - 86_400,
            expires_at: future_expiry,
            amount: Amount::from_sat(50_000),
            script: script.clone(),
            is_preconfirmed: false,
            is_swept: false,
            is_unrolled: false,
            is_spent: false,
            spent_by: None,
            commitment_txids: vec![],
            settled_by: None,
            ark_txid: None,
            assets: vec![],
        };
        let deprecated_pk = PublicKey::from_str(
            "02c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5",
        )
        .expect("valid key")
        .x_only_public_key()
        .0;
        let snapshot = snapshot_from_virtual_tx_outpoints_with_script_lookup(
            330,
            1_000_000,
            vec![vtxo],
            |lookup_script| {
                if lookup_script == &script {
                    Some(deprecated_pk)
                } else {
                    None
                }
            },
        );
        let server_info = test_server_info_for_snapshot(
            "0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798",
            vec![(
                "02c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5",
                500_000,
            )],
        );
        let buckets = offchain_balance_buckets_from_snapshot(
            &snapshot,
            &server_info,
            1_000_000,
            None,
            &BTreeMap::new(),
        )
        .expect("snapshot buckets");

        assert_eq!(buckets.pending_recovery_due_to_expired_signer_sats, 50_000);
    }

    fn test_server_info_for_snapshot(current_hex: &str, deprecated: Vec<(&str, i64)>) -> Info {
        let dummy_address: bitcoin::Address<bitcoin::address::NetworkUnchecked> =
            "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx"
                .parse()
                .unwrap();
        Info {
            version: "1".into(),
            signer_pk: PublicKey::from_str(current_hex).expect("valid key"),
            forfeit_pk: PublicKey::from_str(current_hex).expect("valid key"),
            forfeit_address: dummy_address.assume_checked(),
            checkpoint_tapscript: ScriptBuf::new(),
            network: Network::Signet,
            session_duration: 0,
            unilateral_exit_delay: bitcoin::Sequence::ZERO,
            boarding_exit_delay: bitcoin::Sequence::ZERO,
            utxo_min_amount: None,
            utxo_max_amount: None,
            vtxo_min_amount: None,
            vtxo_max_amount: None,
            dust: Amount::ZERO,
            fees: None,
            scheduled_session: None,
            deprecated_signers: deprecated
                .into_iter()
                .map(|(key, cutoff)| DeprecatedSigner {
                    pk: PublicKey::from_str(key).expect("valid key"),
                    cutoff_date: cutoff,
                })
                .collect(),
            service_status: HashMap::new(),
            digest: String::new(),
            max_tx_weight: 0,
            max_op_return_outputs: 0,
        }
    }

    #[test]
    fn vtxo_list_from_snapshot_rejects_invalid_txid() {
        let snapshot = OffchainVtxoSnapshot {
            synced_at: 1_700_000_000,
            dust_sats: 330,
            virtual_tx_outpoints: vec![VirtualTxOutPointRecord {
                txid: "not-a-txid".to_string(),
                vout: 0,
                created_at: 1_700_000_000,
                expires_at: 1_800_000_000,
                amount_sats: 1_000,
                script_hex: String::new(),
                is_preconfirmed: false,
                is_swept: false,
                is_unrolled: false,
                is_spent: false,
                spent_by: None,
                commitment_txids: vec![],
                settled_by: None,
                ark_txid: None,
                assets: vec![],
                server_pk_hex: None,
            }],
            unilateral_exit_materials_by_host_tx: BTreeMap::new(),
            full_listed_at: 0,
        };

        let error = vtxo_list_from_snapshot(&snapshot).expect_err("invalid txid");
        assert!(matches!(error, ArkWasmError::Snapshot(_)));
    }
}
