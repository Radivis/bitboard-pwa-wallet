use std::str::FromStr;

use bitcoin::{OutPoint, Txid};
use serde::{Deserialize, Serialize};

use crate::error::{ArkResult, ArkWasmError};

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
}
