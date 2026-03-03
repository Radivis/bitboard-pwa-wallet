use bitcoin::Network;
use serde::{Deserialize, Serialize};

use crate::error::CryptoError;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum AddressType {
    Taproot,
    Segwit,
}

impl TryFrom<&str> for AddressType {
    type Error = CryptoError;

    fn try_from(value: &str) -> Result<Self, Self::Error> {
        match value {
            "taproot" => Ok(AddressType::Taproot),
            "segwit" => Ok(AddressType::Segwit),
            _ => Err(CryptoError::Descriptor(format!(
                "Unknown address type: {}",
                value
            ))),
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum BitcoinNetwork {
    Bitcoin,
    Testnet,
    Signet,
    Regtest,
}

impl From<BitcoinNetwork> for Network {
    fn from(network: BitcoinNetwork) -> Network {
        match network {
            BitcoinNetwork::Bitcoin => Network::Bitcoin,
            BitcoinNetwork::Testnet => Network::Testnet,
            BitcoinNetwork::Signet => Network::Signet,
            BitcoinNetwork::Regtest => Network::Regtest,
        }
    }
}

impl From<Network> for BitcoinNetwork {
    fn from(network: Network) -> BitcoinNetwork {
        match network {
            Network::Bitcoin => BitcoinNetwork::Bitcoin,
            Network::Testnet => BitcoinNetwork::Testnet,
            Network::Signet => BitcoinNetwork::Signet,
            Network::Regtest => BitcoinNetwork::Regtest,
            _ => BitcoinNetwork::Signet,
        }
    }
}

impl TryFrom<&str> for BitcoinNetwork {
    type Error = CryptoError;

    fn try_from(value: &str) -> Result<Self, Self::Error> {
        match value {
            "bitcoin" => Ok(BitcoinNetwork::Bitcoin),
            "testnet" => Ok(BitcoinNetwork::Testnet),
            "signet" => Ok(BitcoinNetwork::Signet),
            "regtest" => Ok(BitcoinNetwork::Regtest),
            _ => Err(CryptoError::Descriptor(format!("Unknown network: {}", value))),
        }
    }
}

/// A pair of descriptor strings (external for receiving, internal for change).
/// These are serialized to/from the WASM boundary as JSON.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct DescriptorPair {
    pub external: String,
    pub internal: String,
}
