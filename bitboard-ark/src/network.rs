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

#[cfg(test)]
mod tests {
    use super::NetworkMode;
    use bitcoin::Network;

    #[test]
    fn network_mode_parse_and_label() {
        assert_eq!(NetworkMode::parse("mainnet"), Some(NetworkMode::Mainnet));
        assert_eq!(NetworkMode::parse("signet"), Some(NetworkMode::Signet));
        assert_eq!(NetworkMode::parse("testnet"), Some(NetworkMode::Testnet));
        assert_eq!(NetworkMode::parse("regtest"), None);

        assert_eq!(NetworkMode::Signet.to_bitcoin_network(), Network::Signet);
        assert_eq!(NetworkMode::Signet.label(), "signet (Mutinynet)");
    }
}
