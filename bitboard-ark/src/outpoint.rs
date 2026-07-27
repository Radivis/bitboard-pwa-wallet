use std::str::FromStr;

use ark_core::server::VirtualTxOutPoint;
use bitcoin::{OutPoint, Txid};
use serde::{Deserialize, Serialize};

use crate::error::{ArkResult, ArkWasmError};
use crate::offchain_snapshot::virtual_tx_outpoint_from_record;
use crate::persistence::{OffchainVtxoSnapshot, VirtualTxOutPointRecord};
use crate::unilateral_exit_materials::record_is_exit_eligible;

/// Identifies a virtual transaction output (VTXO) in the Ark off-chain model.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VirtualOutPoint {
    pub txid: Txid,
    pub vout: u32,
}

impl VirtualOutPoint {
    pub fn new(txid: Txid, vout: u32) -> Self {
        Self { txid, vout }
    }

    pub fn parse(txid: &str, vout: u32) -> ArkResult<Self> {
        Ok(Self {
            txid: Txid::from_str(txid)
                .map_err(|error| ArkWasmError::InvalidTxid(error.to_string()))?,
            vout,
        })
    }

    pub fn from_bitcoin_outpoint(outpoint: OutPoint) -> Self {
        Self {
            txid: outpoint.txid,
            vout: outpoint.vout,
        }
    }

    /// Bitcoin `OutPoint` shape used by ark-client and bitcoin crates.
    pub fn to_bitcoin_outpoint(&self) -> OutPoint {
        OutPoint {
            txid: self.txid,
            vout: self.vout,
        }
    }
}

/// Identifies an on-chain UTXO (boarding, bumper, Esplora, etc.).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct OnchainOutPoint(OutPoint);

impl OnchainOutPoint {
    pub fn parse(txid: &str, vout: u32) -> ArkResult<Self> {
        parse_bitcoin_outpoint(txid, vout).map(Self)
    }

    pub fn from_bitcoin_outpoint(outpoint: OutPoint) -> Self {
        Self(outpoint)
    }

    pub fn txid(&self) -> &Txid {
        &self.0.txid
    }

    pub fn vout(&self) -> u32 {
        self.0.vout
    }

    pub fn inner(self) -> OutPoint {
        self.0
    }

    pub fn as_inner(&self) -> &OutPoint {
        &self.0
    }
}

impl From<OutPoint> for OnchainOutPoint {
    fn from(outpoint: OutPoint) -> Self {
        Self::from_bitcoin_outpoint(outpoint)
    }
}

impl From<OnchainOutPoint> for OutPoint {
    fn from(value: OnchainOutPoint) -> Self {
        value.0
    }
}

fn parse_bitcoin_outpoint(txid: &str, vout: u32) -> ArkResult<OutPoint> {
    let txid =
        Txid::from_str(txid).map_err(|error| ArkWasmError::InvalidTxid(error.to_string()))?;
    Ok(OutPoint { txid, vout })
}

/// Lowest vout among selected leaf siblings (for status / indexer polling labels).
pub fn representative_vout_among_virtual_outpoints(outpoints: &[VirtualOutPoint]) -> u32 {
    outpoints
        .iter()
        .map(|outpoint| outpoint.vout)
        .min()
        .unwrap_or(0)
}

fn representative_virtual_tx_outpoint_record_for_leaf_tx<'a>(
    snapshot: &'a OffchainVtxoSnapshot,
    leaf_txid: &str,
) -> ArkResult<&'a VirtualTxOutPointRecord> {
    if let Some(record) = snapshot
        .virtual_tx_outpoints
        .iter()
        .filter(|record| record.txid == leaf_txid && record_is_exit_eligible(record))
        .min_by_key(|record| record.vout)
    {
        return Ok(record);
    }

    snapshot
        .virtual_tx_outpoints
        .iter()
        .filter(|record| record.txid == leaf_txid)
        .min_by_key(|record| record.vout)
        .ok_or_else(|| ArkWasmError::VtxoNotFound {
            txid: leaf_txid.to_string(),
            vout: 0,
        })
}

/// Pick a deterministic [`VirtualTxOutPoint`] for ark-client calls on a leaf tx.
///
/// Prefers the lowest-vout exit-eligible sibling; falls back to the lowest vout on the tx.
pub fn representative_virtual_tx_outpoint_for_leaf_tx(
    snapshot: &OffchainVtxoSnapshot,
    leaf_txid: &str,
) -> ArkResult<VirtualTxOutPoint> {
    let record = representative_virtual_tx_outpoint_record_for_leaf_tx(snapshot, leaf_txid)?;
    virtual_tx_outpoint_from_record(record)
}

#[cfg(test)]
mod tests {
    use super::*;
    use bitcoin::hashes::Hash;

    #[test]
    fn virtual_outpoint_round_trips_through_bitcoin_outpoint() {
        let txid = Txid::from_byte_array([0xab; 32]);
        let virtual_outpoint = VirtualOutPoint::from_bitcoin_outpoint(OutPoint { txid, vout: 2 });
        let parsed = virtual_outpoint.to_bitcoin_outpoint();
        assert_eq!(parsed.txid, txid);
        assert_eq!(parsed.vout, 2);
    }

    #[test]
    fn virtual_outpoint_serializes_txid_as_hex_string() {
        let txid = Txid::from_byte_array([0xab; 32]);
        let outpoint = VirtualOutPoint::new(txid, 1);
        let json = serde_json::to_string(&outpoint).expect("serialize virtual outpoint");
        assert!(json.contains(&txid.to_string()));
    }

    #[test]
    fn onchain_outpoint_wraps_bitcoin_outpoint() {
        let txid = Txid::from_byte_array([0xcd; 32]);
        let onchain = OnchainOutPoint::from_bitcoin_outpoint(OutPoint { txid, vout: 1 });
        assert_eq!(*onchain.txid(), txid);
        assert_eq!(onchain.vout(), 1);
        assert_eq!(onchain.inner(), OutPoint { txid, vout: 1 });
    }

    #[test]
    fn onchain_outpoint_parse_rejects_invalid_txid() {
        assert!(OnchainOutPoint::parse("not-a-txid", 0).is_err());
    }

    #[test]
    fn representative_vout_among_virtual_outpoints_prefers_lowest_vout() {
        let txid = Txid::from_byte_array([0x11; 32]);
        assert_eq!(
            representative_vout_among_virtual_outpoints(&[
                VirtualOutPoint::new(txid, 2),
                VirtualOutPoint::new(txid, 0),
                VirtualOutPoint::new(txid, 1),
            ]),
            0
        );
    }

    #[test]
    fn representative_virtual_tx_outpoint_for_leaf_tx_prefers_exit_eligible_lowest_vout() {
        use crate::persistence::OffchainVtxoSnapshot;
        use std::collections::BTreeMap;

        let txid = "aa".repeat(32);
        let snapshot = OffchainVtxoSnapshot {
            synced_at: 1,
            dust_sats: 330,
            virtual_tx_outpoints: vec![
                VirtualTxOutPointRecord {
                    txid: txid.clone(),
                    vout: 0,
                    created_at: 0,
                    expires_at: 0,
                    amount_sats: 80_000,
                    script_hex: "00".to_string(),
                    is_preconfirmed: true,
                    is_swept: false,
                    is_unrolled: false,
                    is_spent: true,
                    spent_by: None,
                    commitment_txids: vec![],
                    settled_by: None,
                    ark_txid: None,
                    assets: vec![],
                    server_pk_hex: None,
                },
                VirtualTxOutPointRecord {
                    txid: txid.clone(),
                    vout: 1,
                    created_at: 0,
                    expires_at: 0,
                    amount_sats: 118_000,
                    script_hex: "00".to_string(),
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
                },
            ],
            unilateral_exit_materials_by_leaf_tx: BTreeMap::new(),
        };

        let representative = representative_virtual_tx_outpoint_for_leaf_tx(&snapshot, &txid)
            .expect("representative");
        assert_eq!(representative.outpoint.vout, 1);
    }
}
