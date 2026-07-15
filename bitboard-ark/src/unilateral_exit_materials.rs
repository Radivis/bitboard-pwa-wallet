use std::collections::HashMap;
use std::str::FromStr;

use ark_core::server::{ChainedTxType, VtxoChain, VtxoChains};
use bitcoin::hex::FromHex;
use bitcoin::{Psbt, Txid};
use serde::{Deserialize, Serialize};

use crate::error::{ArkResult, ArkWasmError};
use crate::persistence::{
    OffchainVtxoSnapshot, UnilateralExitMaterialsRecord, VirtualPsbtRecord, VirtualTxOutPointRecord,
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

pub fn merge_unilateral_exit_materials(
    prior_snapshot: Option<&OffchainVtxoSnapshot>,
    snapshot: &mut OffchainVtxoSnapshot,
) {
    let Some(prior_snapshot) = prior_snapshot else {
        return;
    };
    let prior_by_outpoint: HashMap<(String, u32), &UnilateralExitMaterialsRecord> = prior_snapshot
        .virtual_tx_outpoints
        .iter()
        .filter_map(|record| {
            record
                .unilateral_exit_materials
                .as_ref()
                .map(|materials| ((record.txid.clone(), record.vout), materials))
        })
        .collect();
    for record in &mut snapshot.virtual_tx_outpoints {
        if record.unilateral_exit_materials.is_some() {
            continue;
        }
        if let Some(materials) = prior_by_outpoint.get(&(record.txid.clone(), record.vout)) {
            record.unilateral_exit_materials = Some((*materials).clone());
        }
    }
}

pub fn clear_unilateral_exit_materials_on_ineligible_records(snapshot: &mut OffchainVtxoSnapshot) {
    for record in &mut snapshot.virtual_tx_outpoints {
        if !record_is_exit_eligible(record) {
            record.unilateral_exit_materials = None;
        }
    }
}

pub fn record_is_exit_eligible(record: &VirtualTxOutPointRecord) -> bool {
    !record.is_preconfirmed && !record.is_swept && !record.is_unrolled && !record.is_spent
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
        if record.unilateral_exit_materials.is_some() {
            ready += 1;
        }
    }
    let missing = eligible.saturating_sub(ready);
    (eligible, ready, missing)
}

pub fn snapshot_record_materials<'a>(
    snapshot: &'a OffchainVtxoSnapshot,
    txid: &str,
    vout: u32,
) -> Option<&'a UnilateralExitMaterialsRecord> {
    snapshot
        .virtual_tx_outpoints
        .iter()
        .find(|record| record.txid == txid && record.vout == vout)
        .and_then(|record| record.unilateral_exit_materials.as_ref())
}

fn chained_tx_type_label(tx_type: &ChainedTxType) -> String {
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
    fn merge_preserves_materials_across_snapshot_rebuild() {
        let materials = UnilateralExitMaterialsRecord {
            cached_at: 100,
            chain_json: "{\"inner\":[]}".to_string(),
            virtual_psbts: vec![],
        };
        let prior = OffchainVtxoSnapshot {
            synced_at: 1,
            dust_sats: 330,
            virtual_tx_outpoints: vec![VirtualTxOutPointRecord {
                txid: "aa".repeat(32),
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
                unilateral_exit_materials: Some(materials.clone()),
            }],
        };
        let mut next = OffchainVtxoSnapshot {
            synced_at: 2,
            dust_sats: 330,
            virtual_tx_outpoints: vec![VirtualTxOutPointRecord {
                txid: "aa".repeat(32),
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
                unilateral_exit_materials: None,
            }],
        };
        merge_unilateral_exit_materials(Some(&prior), &mut next);
        assert_eq!(
            next.virtual_tx_outpoints[0]
                .unilateral_exit_materials
                .as_ref()
                .map(|value| value.cached_at),
            Some(100)
        );
    }

    #[test]
    fn materials_status_counts_eligible_ready_and_missing() {
        let materials = UnilateralExitMaterialsRecord {
            cached_at: 1,
            chain_json: "{\"inner\":[]}".to_string(),
            virtual_psbts: vec![],
        };
        let snapshot = OffchainVtxoSnapshot {
            synced_at: 1,
            dust_sats: 330,
            virtual_tx_outpoints: vec![
                VirtualTxOutPointRecord {
                    txid: "aa".repeat(32),
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
                    unilateral_exit_materials: Some(materials),
                },
                VirtualTxOutPointRecord {
                    txid: "bb".repeat(32),
                    vout: 1,
                    created_at: 0,
                    expires_at: 0,
                    amount_sats: 2_000,
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
                    unilateral_exit_materials: None,
                },
                VirtualTxOutPointRecord {
                    txid: "cc".repeat(32),
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
                    unilateral_exit_materials: None,
                },
            ],
        };
        assert_eq!(materials_status_from_snapshot(Some(&snapshot)), (2, 1, 1));
    }
}
