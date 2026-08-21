use std::collections::HashSet;
use std::str::FromStr;

use ark_core::server::{ChainedTxType, VirtualTxOutPoint, VtxoChain, VtxoChains};
use bitcoin::hex::FromHex;
use bitcoin::{Psbt, Txid};
use serde::{Deserialize, Serialize};

use crate::error::{ArkResult, ArkWasmError};
use crate::persistence::{
    OffchainVtxoSnapshot, PendingExitDeductionRecord, PendingExitKind,
    UnilateralExitMaterialsRecord, VirtualPsbtRecord, VirtualTxOutPointRecord,
};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
struct SerializableVtxoChain {
    txid: String,
    tx_type: String,
    spends: Vec<String>,
    expires_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
struct SerializableVtxoChains {
    inner: Vec<SerializableVtxoChain>,
}

pub fn vtxo_chains_to_json(chains: &VtxoChains) -> ArkResult<String> {
    let serializable = SerializableVtxoChains {
        inner: chains
            .inner
            .iter()
            .map(|chain| SerializableVtxoChain {
                txid: chain.txid.to_string(),
                tx_type: chained_tx_type_label(&chain.tx_type),
                spends: chain.spends.iter().map(|txid| txid.to_string()).collect(),
                expires_at: chain.expires_at,
            })
            .collect(),
    };
    serde_json::to_string(&serializable)
        .map_err(|error| ArkWasmError::Snapshot(format!("chain json encode: {error}")))
}

pub fn vtxo_chains_from_json(chain_json: &str) -> ArkResult<VtxoChains> {
    let serializable: SerializableVtxoChains = serde_json::from_str(chain_json)
        .map_err(|error| ArkWasmError::Snapshot(format!("chain json decode: {error}")))?;
    serializable
        .inner
        .into_iter()
        .map(|chain| {
            Ok(VtxoChain {
                txid: Txid::from_str(&chain.txid).map_err(|error| {
                    ArkWasmError::Snapshot(format!("invalid chain txid: {error}"))
                })?,
                tx_type: parse_chained_tx_type(&chain.tx_type)?,
                spends: chain
                    .spends
                    .iter()
                    .map(|txid| {
                        Txid::from_str(txid).map_err(|error| {
                            ArkWasmError::Snapshot(format!("invalid spend txid: {error}"))
                        })
                    })
                    .collect::<Result<Vec<_>, _>>()?,
                expires_at: chain.expires_at,
            })
        })
        .collect::<ArkResult<Vec<_>>>()
        .map(|inner| VtxoChains { inner })
}

pub fn virtual_psbts_to_records(psbts: &[Psbt]) -> ArkResult<Vec<VirtualPsbtRecord>> {
    psbts
        .iter()
        .map(|psbt| {
            Ok(VirtualPsbtRecord {
                virtual_txid: psbt.unsigned_tx.compute_txid().to_string(),
                psbt_hex: hex::encode(psbt.serialize()),
            })
        })
        .collect()
}

pub fn virtual_psbts_from_records(records: &[VirtualPsbtRecord]) -> ArkResult<Vec<Psbt>> {
    records
        .iter()
        .map(|record| {
            let bytes = Vec::from_hex(&record.psbt_hex).map_err(|error| {
                ArkWasmError::Snapshot(format!(
                    "invalid psbt hex for {}: {error}",
                    record.virtual_txid
                ))
            })?;
            Psbt::deserialize(&bytes).map_err(|error| {
                ArkWasmError::Snapshot(format!("invalid psbt for {}: {error}", record.virtual_txid))
            })
        })
        .collect()
}

pub fn materials_record_from_prefetch(
    cached_at: i64,
    chains: &VtxoChains,
    psbts: &[Psbt],
) -> ArkResult<UnilateralExitMaterialsRecord> {
    Ok(UnilateralExitMaterialsRecord {
        cached_at,
        chain_json: vtxo_chains_to_json(chains)?,
        virtual_psbts: virtual_psbts_to_records(psbts)?,
    })
}

pub fn snapshot_materials_for_leaf_tx<'a>(
    snapshot: &'a OffchainVtxoSnapshot,
    leaf_txid: &str,
) -> Option<&'a UnilateralExitMaterialsRecord> {
    snapshot.unilateral_exit_materials_by_leaf_tx.get(leaf_txid)
}

/// Require prefetched materials for a leaf. Unroll/complete never live-prefetch from the ASP.
pub fn require_unilateral_exit_materials_for_leaf_tx<'a>(
    snapshot: &'a OffchainVtxoSnapshot,
    leaf_txid: &str,
) -> ArkResult<&'a UnilateralExitMaterialsRecord> {
    snapshot_materials_for_leaf_tx(snapshot, leaf_txid)
        .ok_or(ArkWasmError::AutonomousExitMaterialsMissing)
}

pub fn vtxo_chains_from_snapshot_materials(
    snapshot: &OffchainVtxoSnapshot,
    leaf_txid: &str,
) -> ArkResult<VtxoChains> {
    let materials = require_unilateral_exit_materials_for_leaf_tx(snapshot, leaf_txid)?;
    vtxo_chains_from_json(&materials.chain_json)
}

pub fn vtxo_amount_sats_from_snapshot(
    snapshot: Option<&OffchainVtxoSnapshot>,
    txid: &str,
    vout: u32,
) -> Option<u64> {
    snapshot.and_then(|snapshot| {
        snapshot
            .virtual_tx_outpoints
            .iter()
            .find(|record| record.txid == txid && record.vout == vout)
            .map(|record| record.amount_sats)
    })
}

pub fn store_materials_for_leaf_tx(
    snapshot: &mut OffchainVtxoSnapshot,
    leaf_txid: &str,
    materials: UnilateralExitMaterialsRecord,
) {
    snapshot
        .unilateral_exit_materials_by_leaf_tx
        .insert(leaf_txid.to_string(), materials);
}

pub fn merge_unilateral_exit_materials_maps(
    prior_snapshot: Option<&OffchainVtxoSnapshot>,
    snapshot: &mut OffchainVtxoSnapshot,
) {
    let Some(prior_snapshot) = prior_snapshot else {
        return;
    };
    for (leaf_txid, materials) in &prior_snapshot.unilateral_exit_materials_by_leaf_tx {
        snapshot
            .unilateral_exit_materials_by_leaf_tx
            .entry(leaf_txid.clone())
            .or_insert_with(|| materials.clone());
    }
}

pub fn reinject_pending_unilateral_exit_records(
    prior_snapshot: Option<&OffchainVtxoSnapshot>,
    snapshot: &mut OffchainVtxoSnapshot,
    pending_outpoints: impl IntoIterator<Item = (String, u32)>,
) {
    let Some(prior_snapshot) = prior_snapshot else {
        return;
    };
    for (txid, vout) in pending_outpoints {
        if snapshot
            .virtual_tx_outpoints
            .iter()
            .any(|record| record.txid == txid && record.vout == vout)
        {
            continue;
        }
        if let Some(prior_record) = prior_snapshot
            .virtual_tx_outpoints
            .iter()
            .find(|record| record.txid == txid && record.vout == vout)
        {
            snapshot.virtual_tx_outpoints.push(prior_record.clone());
        }
    }
}

pub fn pending_unilateral_exit_leaf_txids(
    pending: &[PendingExitDeductionRecord],
) -> HashSet<String> {
    pending
        .iter()
        .filter(|record| record.kind == PendingExitKind::Unilateral)
        .filter_map(|record| record.vtxo_txid.clone())
        .collect()
}

pub fn prune_unilateral_exit_materials_map(
    snapshot: &mut OffchainVtxoSnapshot,
    preserve_leaf_txids: &HashSet<String>,
) {
    snapshot
        .unilateral_exit_materials_by_leaf_tx
        .retain(|leaf_txid, _| {
            if preserve_leaf_txids.contains(leaf_txid) {
                return true;
            }
            snapshot
                .virtual_tx_outpoints
                .iter()
                .any(|record| record.txid == *leaf_txid && record_is_exit_eligible(record))
        });
}

fn vtxo_flags_are_exit_eligible(is_swept: bool, is_unrolled: bool, is_spent: bool) -> bool {
    !is_swept && !is_unrolled && !is_spent
}

pub fn record_is_exit_eligible(record: &VirtualTxOutPointRecord) -> bool {
    vtxo_flags_are_exit_eligible(record.is_swept, record.is_unrolled, record.is_spent)
}

pub fn virtual_tx_outpoint_is_exit_eligible(virtual_tx_outpoint: &VirtualTxOutPoint) -> bool {
    vtxo_flags_are_exit_eligible(
        virtual_tx_outpoint.is_swept,
        virtual_tx_outpoint.is_unrolled,
        virtual_tx_outpoint.is_spent,
    )
}

pub fn virtual_tx_outpoint_has_unilateral_exit_prepared(
    snapshot: Option<&OffchainVtxoSnapshot>,
    virtual_tx_outpoint: &VirtualTxOutPoint,
) -> bool {
    if !virtual_tx_outpoint_is_exit_eligible(virtual_tx_outpoint) {
        return false;
    }
    let Some(snapshot) = snapshot else {
        return false;
    };
    let txid = virtual_tx_outpoint.outpoint.txid.to_string();
    snapshot_materials_for_leaf_tx(snapshot, &txid).is_some()
}

pub fn materials_status_from_snapshot(snapshot: Option<&OffchainVtxoSnapshot>) -> (u32, u32, u32) {
    let Some(snapshot) = snapshot else {
        return (0, 0, 0);
    };
    let mut eligible = 0u32;
    let mut ready = 0u32;
    for record in &snapshot.virtual_tx_outpoints {
        if !record_is_exit_eligible(record) {
            continue;
        }
        eligible += 1;
        if snapshot
            .unilateral_exit_materials_by_leaf_tx
            .contains_key(&record.txid)
        {
            ready += 1;
        }
    }
    let missing = eligible.saturating_sub(ready);
    (eligible, ready, missing)
}

pub(crate) fn chained_tx_type_label(tx_type: &ChainedTxType) -> String {
    match tx_type {
        ChainedTxType::Commitment => "commitment".to_string(),
        ChainedTxType::Tree => "tree".to_string(),
        ChainedTxType::Checkpoint => "checkpoint".to_string(),
        ChainedTxType::Ark => "ark".to_string(),
        ChainedTxType::Unspecified => "unspecified".to_string(),
    }
}

fn parse_chained_tx_type(label: &str) -> ArkResult<ChainedTxType> {
    match label {
        "commitment" => Ok(ChainedTxType::Commitment),
        "tree" => Ok(ChainedTxType::Tree),
        "checkpoint" => Ok(ChainedTxType::Checkpoint),
        "ark" => Ok(ChainedTxType::Ark),
        "unspecified" => Ok(ChainedTxType::Unspecified),
        other => Err(ArkWasmError::Snapshot(format!(
            "unknown chained tx type: {other}"
        ))),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use ark_core::server::ChainedTxType;
    use bitcoin::hashes::Hash;
    use std::collections::BTreeMap;

    fn empty_materials_map() -> BTreeMap<String, UnilateralExitMaterialsRecord> {
        BTreeMap::new()
    }

    fn sample_materials(cached_at: i64) -> UnilateralExitMaterialsRecord {
        UnilateralExitMaterialsRecord {
            cached_at,
            chain_json: "{\"inner\":[]}".to_string(),
            virtual_psbts: vec![],
        }
    }

    fn sibling_record(txid: &str, vout: u32, is_spent: bool) -> VirtualTxOutPointRecord {
        VirtualTxOutPointRecord {
            txid: txid.to_string(),
            vout,
            created_at: 0,
            expires_at: 0,
            amount_sats: 1_000,
            script_hex: "00".to_string(),
            is_preconfirmed: true,
            is_swept: false,
            is_unrolled: false,
            is_spent,
            spent_by: None,
            commitment_txids: vec![],
            settled_by: None,
            ark_txid: None,
            assets: vec![],
            server_pk_hex: None,
        }
    }

    #[test]
    fn vtxo_chains_json_round_trip() {
        let chains = VtxoChains {
            inner: vec![VtxoChain {
                txid: Txid::from_byte_array([0xab; 32]),
                tx_type: ChainedTxType::Tree,
                spends: vec![Txid::from_byte_array([0xcd; 32])],
                expires_at: 1_700_000_000,
            }],
        };
        let json = vtxo_chains_to_json(&chains).expect("encode");
        let restored = vtxo_chains_from_json(&json).expect("decode");
        assert_eq!(restored.inner.len(), 1);
        assert_eq!(restored.inner[0].txid, chains.inner[0].txid);
        assert_eq!(restored.inner[0].spends, chains.inner[0].spends);
    }

    #[test]
    fn exit_eligibility_requires_exit_blocking_flags_cleared() {
        assert!(vtxo_flags_are_exit_eligible(false, false, false));
        assert!(!vtxo_flags_are_exit_eligible(true, false, false));
        assert!(!vtxo_flags_are_exit_eligible(false, true, false));
        assert!(!vtxo_flags_are_exit_eligible(false, false, true));
    }

    #[test]
    fn preconfirmed_vtxo_is_exit_eligible() {
        let record = sibling_record("aa", 0, false);
        assert!(record_is_exit_eligible(&record));
    }

    #[test]
    fn require_unilateral_exit_materials_for_leaf_tx_errors_when_missing() {
        let txid = "aa".repeat(32);
        let snapshot = OffchainVtxoSnapshot {
            synced_at: 1,
            dust_sats: 330,
            virtual_tx_outpoints: vec![sibling_record(&txid, 0, false)],
            unilateral_exit_materials_by_leaf_tx: empty_materials_map(),
        };
        let error = require_unilateral_exit_materials_for_leaf_tx(&snapshot, &txid)
            .expect_err("missing materials");
        assert!(matches!(
            error,
            ArkWasmError::AutonomousExitMaterialsMissing
        ));
    }

    #[test]
    fn require_unilateral_exit_materials_for_leaf_tx_ok_when_present() {
        let txid = "aa".repeat(32);
        let mut snapshot = OffchainVtxoSnapshot {
            synced_at: 1,
            dust_sats: 330,
            virtual_tx_outpoints: vec![sibling_record(&txid, 0, false)],
            unilateral_exit_materials_by_leaf_tx: empty_materials_map(),
        };
        store_materials_for_leaf_tx(&mut snapshot, &txid, sample_materials(7));
        let materials =
            require_unilateral_exit_materials_for_leaf_tx(&snapshot, &txid).expect("present");
        assert_eq!(materials.cached_at, 7);
    }

    #[test]
    fn vtxo_chains_from_snapshot_materials_loads_cached_chain() {
        let txid = Txid::from_byte_array([0xab; 32]);
        let leaf_txid = txid.to_string();
        let chains = VtxoChains {
            inner: vec![VtxoChain {
                txid,
                tx_type: ChainedTxType::Tree,
                spends: vec![Txid::from_byte_array([0xcd; 32])],
                expires_at: 1_700_000_000,
            }],
        };
        let mut snapshot = OffchainVtxoSnapshot {
            synced_at: 1,
            dust_sats: 330,
            virtual_tx_outpoints: vec![sibling_record(&leaf_txid, 0, false)],
            unilateral_exit_materials_by_leaf_tx: empty_materials_map(),
        };
        store_materials_for_leaf_tx(
            &mut snapshot,
            &leaf_txid,
            UnilateralExitMaterialsRecord {
                cached_at: 1,
                chain_json: vtxo_chains_to_json(&chains).expect("encode"),
                virtual_psbts: vec![],
            },
        );
        let restored =
            vtxo_chains_from_snapshot_materials(&snapshot, &leaf_txid).expect("load chains");
        assert_eq!(restored.inner.len(), 1);
        assert_eq!(restored.inner[0].txid, txid);
    }

    #[test]
    fn vtxo_amount_sats_from_snapshot_returns_none_when_missing() {
        let txid = "aa".repeat(32);
        let snapshot = OffchainVtxoSnapshot {
            synced_at: 1,
            dust_sats: 330,
            virtual_tx_outpoints: vec![sibling_record(&txid, 0, false)],
            unilateral_exit_materials_by_leaf_tx: empty_materials_map(),
        };
        assert_eq!(
            vtxo_amount_sats_from_snapshot(Some(&snapshot), &txid, 0),
            Some(1_000)
        );
        assert_eq!(
            vtxo_amount_sats_from_snapshot(Some(&snapshot), &txid, 1),
            None
        );
        assert_eq!(vtxo_amount_sats_from_snapshot(None, &txid, 0), None);
    }

    #[test]
    fn store_materials_for_leaf_tx_keeps_single_map_entry_for_siblings() {
        let txid = "aa".repeat(32);
        let materials = sample_materials(42);
        let mut snapshot = OffchainVtxoSnapshot {
            synced_at: 1,
            dust_sats: 330,
            virtual_tx_outpoints: vec![
                sibling_record(&txid, 0, false),
                sibling_record(&txid, 1, false),
            ],
            unilateral_exit_materials_by_leaf_tx: empty_materials_map(),
        };
        store_materials_for_leaf_tx(&mut snapshot, &txid, materials);
        assert_eq!(
            snapshot
                .unilateral_exit_materials_by_leaf_tx
                .get(&txid)
                .map(|value| value.cached_at),
            Some(42)
        );
    }

    #[test]
    fn merge_preserves_materials_across_snapshot_rebuild() {
        let txid = "aa".repeat(32);
        let materials = sample_materials(100);
        let prior = OffchainVtxoSnapshot {
            synced_at: 1,
            dust_sats: 330,
            virtual_tx_outpoints: vec![sibling_record(&txid, 0, false)],
            unilateral_exit_materials_by_leaf_tx: {
                let mut map = empty_materials_map();
                map.insert(txid.clone(), materials);
                map
            },
        };
        let mut next = OffchainVtxoSnapshot {
            synced_at: 2,
            dust_sats: 330,
            virtual_tx_outpoints: vec![sibling_record(&txid, 0, false)],
            unilateral_exit_materials_by_leaf_tx: empty_materials_map(),
        };
        merge_unilateral_exit_materials_maps(Some(&prior), &mut next);
        assert_eq!(
            next.unilateral_exit_materials_by_leaf_tx
                .get(&txid)
                .map(|value| value.cached_at),
            Some(100)
        );
    }

    #[test]
    fn materials_status_counts_eligible_ready_and_missing() {
        let txid_ready = "aa".repeat(32);
        let txid_missing = "bb".repeat(32);
        let txid_unrolled = "cc".repeat(32);
        let mut materials_map = empty_materials_map();
        materials_map.insert(txid_ready.clone(), sample_materials(1));
        let snapshot = OffchainVtxoSnapshot {
            synced_at: 1,
            dust_sats: 330,
            virtual_tx_outpoints: vec![
                sibling_record(&txid_ready, 0, false),
                sibling_record(&txid_missing, 1, false),
                VirtualTxOutPointRecord {
                    txid: txid_unrolled,
                    vout: 0,
                    created_at: 0,
                    expires_at: 0,
                    amount_sats: 3_000,
                    script_hex: "00".to_string(),
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
                },
            ],
            unilateral_exit_materials_by_leaf_tx: materials_map,
        };
        assert_eq!(materials_status_from_snapshot(Some(&snapshot)), (2, 1, 1));
    }

    #[test]
    fn partial_sibling_state_retains_materials_until_no_eligible_vout_remains() {
        let txid = "aa".repeat(32);
        let mut snapshot = OffchainVtxoSnapshot {
            synced_at: 1,
            dust_sats: 330,
            virtual_tx_outpoints: vec![
                sibling_record(&txid, 0, true),
                sibling_record(&txid, 1, false),
            ],
            unilateral_exit_materials_by_leaf_tx: {
                let mut map = empty_materials_map();
                map.insert(txid.clone(), sample_materials(1));
                map
            },
        };
        prune_unilateral_exit_materials_map(&mut snapshot, &HashSet::new());
        assert!(
            snapshot
                .unilateral_exit_materials_by_leaf_tx
                .contains_key(&txid)
        );

        use ark_core::server::VirtualTxOutPoint;
        use bitcoin::{Amount, OutPoint, ScriptBuf, Txid};

        let leaf_txid = Txid::from_str(&txid).expect("txid");
        let spent_vtxo = VirtualTxOutPoint {
            outpoint: OutPoint {
                txid: leaf_txid,
                vout: 0,
            },
            created_at: 0,
            expires_at: 0,
            amount: Amount::from_sat(1_000),
            script: ScriptBuf::from_bytes(vec![0]),
            is_preconfirmed: true,
            is_swept: false,
            is_unrolled: false,
            is_spent: true,
            spent_by: None,
            commitment_txids: vec![],
            settled_by: None,
            ark_txid: None,
            assets: vec![],
        };
        let eligible_vtxo = VirtualTxOutPoint {
            outpoint: OutPoint {
                txid: leaf_txid,
                vout: 1,
            },
            created_at: 0,
            expires_at: 0,
            amount: Amount::from_sat(1_000),
            script: ScriptBuf::from_bytes(vec![0]),
            is_preconfirmed: true,
            is_swept: false,
            is_unrolled: false,
            is_spent: false,
            spent_by: None,
            commitment_txids: vec![],
            settled_by: None,
            ark_txid: None,
            assets: vec![],
        };
        assert!(!virtual_tx_outpoint_has_unilateral_exit_prepared(
            Some(&snapshot),
            &spent_vtxo
        ));
        assert!(virtual_tx_outpoint_has_unilateral_exit_prepared(
            Some(&snapshot),
            &eligible_vtxo
        ));

        snapshot.virtual_tx_outpoints[1].is_spent = true;
        prune_unilateral_exit_materials_map(&mut snapshot, &HashSet::new());
        assert!(
            !snapshot
                .unilateral_exit_materials_by_leaf_tx
                .contains_key(&txid)
        );
    }

    #[test]
    fn virtual_tx_outpoint_has_unilateral_exit_prepared_requires_eligibility_and_materials() {
        use ark_core::server::VirtualTxOutPoint;
        use bitcoin::{Amount, OutPoint, ScriptBuf, Txid};

        let txid = Txid::from_byte_array([0xaa; 32]);
        let txid_string = txid.to_string();
        let snapshot = OffchainVtxoSnapshot {
            synced_at: 1,
            dust_sats: 330,
            virtual_tx_outpoints: vec![VirtualTxOutPointRecord {
                txid: txid_string.clone(),
                vout: 0,
                created_at: 0,
                expires_at: 0,
                amount_sats: 1_000,
                script_hex: "00".to_string(),
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
            unilateral_exit_materials_by_leaf_tx: {
                let mut map = empty_materials_map();
                map.insert(txid_string, sample_materials(1));
                map
            },
        };
        let eligible_vtxo = VirtualTxOutPoint {
            outpoint: OutPoint { txid, vout: 0 },
            created_at: 0,
            expires_at: 0,
            amount: Amount::from_sat(1_000),
            script: ScriptBuf::from_bytes(vec![0]),
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
        assert!(virtual_tx_outpoint_has_unilateral_exit_prepared(
            Some(&snapshot),
            &eligible_vtxo
        ));

        let unrolled_vtxo = VirtualTxOutPoint {
            is_unrolled: true,
            ..eligible_vtxo.clone()
        };
        assert!(!virtual_tx_outpoint_has_unilateral_exit_prepared(
            Some(&snapshot),
            &unrolled_vtxo
        ));
        assert!(!virtual_tx_outpoint_has_unilateral_exit_prepared(
            None,
            &eligible_vtxo
        ));
    }
}
