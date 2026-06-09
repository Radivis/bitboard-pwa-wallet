use bitcoin::Network;

use crate::constants::{NETWORK_MODE_MAINNET, NETWORK_MODE_SIGNET, NETWORK_MODE_TESTNET};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum NetworkMode {
    Mainnet,
    Testnet,
    Signet,
}

impl NetworkMode {
    pub fn parse(value: &str) -> Option<Self> {
        match value {
            NETWORK_MODE_MAINNET => Some(Self::Mainnet),
            NETWORK_MODE_TESTNET => Some(Self::Testnet),
            NETWORK_MODE_SIGNET => Some(Self::Signet),
            _ => None,
        }
    }

    pub fn to_bitcoin_network(self) -> Network {
        match self {
            Self::Mainnet => Network::Bitcoin,
            Self::Testnet => Network::Testnet,
            Self::Signet => Network::Signet,
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            Self::Mainnet => NETWORK_MODE_MAINNET,
            Self::Testnet => NETWORK_MODE_TESTNET,
            Self::Signet => "signet (Mutinynet)",
        }
    }
}
