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

use crate::error::{ArkResult, ArkWasmError};
use crate::exit_balance::{
    UnilateralExitOutpointKey, is_unilateral_exit_in_progress_outpoint,
    unilateral_exit_in_progress_outpoints,
};
use crate::persistence::{
    OffchainVtxoSnapshot, PendingExitDeductionRecord, VirtualTxOutPointAssetRecord,
    VirtualTxOutPointRecord,
};

/// Signer-aware offchain balance buckets in satoshis.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct OffchainBalanceBuckets {
    pub pre_confirmed_sats: u64,
    pub confirmed_sats: u64,
    pub recoverable_sats: u64,
    pub pending_recovery_sats: u64,
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
            pending_recovery_sats: balance.pending_recovery().to_sat(),
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

pub fn pending_recovery_sats_excluding_unilateral_exit(
    vtxo_list: &VtxoList,
    server_info: &Info,
    now: i64,
    script_to_server_pk: impl Fn(&ScriptBuf) -> Option<XOnlyPublicKey>,
    exclude_outpoints: &HashSet<UnilateralExitOutpointKey>,
) -> u64 {
    vtxo_list
        .pending_recovery_due_to_signer_at(server_info, now, &script_to_server_pk)
        .filter(|virtual_tx_outpoint| {
            !is_unilateral_exit_in_progress_outpoint(
                exclude_outpoints,
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
    pending_exit_deductions: &[PendingExitDeductionRecord],
) -> ArkResult<OffchainBalanceBuckets> {
    let vtxo_list = vtxo_list_from_snapshot(snapshot)?;
    let script_lookup = script_to_server_pk_lookup(snapshot, legacy_signer_pk_fallback)?;
    let balance = compute_offchain_balance(&vtxo_list, &script_lookup, server_info, now)
        .map_err(ArkWasmError::from)?;
    let mut buckets = OffchainBalanceBuckets::from_live(&balance);
    let in_progress =
        unilateral_exit_in_progress_outpoints(Some(snapshot), pending_exit_deductions)?;
    buckets.pending_recovery_sats = pending_recovery_sats_excluding_unilateral_exit(
        &vtxo_list,
        server_info,
        now,
        &script_lookup,
        &in_progress,
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
    }
}

/// Preserve local `is_unrolled` when ASP indexer lags after unilateral unroll.
///
/// Clears sticky state when the operator reports `is_spent` or removes the VTXO from the list.
pub fn merge_sticky_unrolled_flags(
    prior: Option<&OffchainVtxoSnapshot>,
    incoming: &mut OffchainVtxoSnapshot,
) {
    let Some(prior) = prior else {
        return;
    };
    let prior_sticky: HashMap<(String, u32), ()> = prior
        .virtual_tx_outpoints
        .iter()
        .filter(|record| record.is_unrolled && !record.is_spent)
        .map(|record| ((record.txid.clone(), record.vout), ()))
        .collect();

    for record in &mut incoming.virtual_tx_outpoints {
        if record.is_spent {
            continue;
        }
        if prior_sticky.contains_key(&(record.txid.clone(), record.vout)) {
            record.is_unrolled = true;
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

fn virtual_tx_outpoint_from_record(
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
        merge_sticky_unrolled_flags, offchain_balance_buckets_from_snapshot,
        offchain_balance_sats_from_snapshot, snapshot_from_virtual_tx_outpoints,
        snapshot_from_virtual_tx_outpoints_with_script_lookup, vtxo_list_from_snapshot,
    };
    use crate::error::ArkWasmError;
    use crate::persistence::{OffchainVtxoSnapshot, VirtualTxOutPointRecord};
    use ark_core::server::VirtualTxOutPoint;
    use ark_core::server::{DeprecatedSigner, Info};
    use bitcoin::Amount;
    use bitcoin::Network;
    use bitcoin::OutPoint;
    use bitcoin::ScriptBuf;
    use bitcoin::Txid;
    use bitcoin::hashes::Hash;
    use bitcoin::secp256k1::PublicKey;
    use std::collections::HashMap;
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

        merge_sticky_unrolled_flags(Some(&prior), &mut incoming);
        assert!(incoming.virtual_tx_outpoints[0].is_unrolled);
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

        merge_sticky_unrolled_flags(Some(&prior), &mut incoming);
        assert!(!incoming.virtual_tx_outpoints[0].is_unrolled);
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
        let buckets =
            offchain_balance_buckets_from_snapshot(&snapshot, &server_info, 1_000_000, None, &[])
                .expect("snapshot buckets");

        assert_eq!(buckets.confirmed_sats, 0);
        assert_eq!(buckets.pending_recovery_sats, 50_000);
    }

    #[test]
    fn pending_recovery_excludes_unilateral_exit_in_progress_outpoint() {
        use crate::persistence::{PendingExitDeductionRecord, PendingExitKind};

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
        let pending = vec![PendingExitDeductionRecord {
            kind: PendingExitKind::Unilateral,
            vtxo_txid: Some(txid),
            vout: Some(0),
            amount_sats: 50_000,
            started_at: 1_000_000,
            baseline_offchain_spendable_sats: None,
        }];
        let buckets = offchain_balance_buckets_from_snapshot(
            &snapshot,
            &server_info,
            1_000_000,
            None,
            &pending,
        )
        .expect("snapshot buckets");

        assert_eq!(buckets.pending_recovery_sats, 0);
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
        };

        let error = vtxo_list_from_snapshot(&snapshot).expect_err("invalid txid");
        assert!(matches!(error, ArkWasmError::Snapshot(_)));
    }
}
