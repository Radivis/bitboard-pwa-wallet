use bitcoin::Network;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum AddressType {
    Taproot,
    Segwit,
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
