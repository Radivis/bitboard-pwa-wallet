use bitcoin::Network;

use crate::constants::{
    NETWORK_MODE_MAINNET, NETWORK_MODE_MUTINYNET, NETWORK_MODE_REGTEST, NETWORK_MODE_SIGNET,
    NETWORK_MODE_TESTNET,
};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum NetworkMode {
    Mainnet,
    Testnet,
    Signet,
    Mutinynet,
    Regtest,
}

impl NetworkMode {
    pub fn parse(value: &str) -> Option<Self> {
        match value {
            NETWORK_MODE_MAINNET => Some(Self::Mainnet),
            NETWORK_MODE_TESTNET => Some(Self::Testnet),
            NETWORK_MODE_SIGNET => Some(Self::Signet),
            NETWORK_MODE_MUTINYNET => Some(Self::Mutinynet),
            NETWORK_MODE_REGTEST => Some(Self::Regtest),
            _ => None,
        }
    }

    pub fn to_bitcoin_network(self) -> Network {
        match self {
            Self::Mainnet => Network::Bitcoin,
            Self::Testnet => Network::Testnet,
            Self::Signet | Self::Mutinynet => Network::Signet,
            Self::Regtest => Network::Regtest,
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            Self::Mainnet => NETWORK_MODE_MAINNET,
            Self::Testnet => NETWORK_MODE_TESTNET,
            Self::Signet => NETWORK_MODE_SIGNET,
            Self::Mutinynet => NETWORK_MODE_MUTINYNET,
            Self::Regtest => NETWORK_MODE_REGTEST,
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
        assert_eq!(
            NetworkMode::parse("mutinynet"),
            Some(NetworkMode::Mutinynet)
        );
        assert_eq!(NetworkMode::parse("testnet"), Some(NetworkMode::Testnet));
        assert_eq!(NetworkMode::parse("regtest"), Some(NetworkMode::Regtest));

        assert_eq!(NetworkMode::Signet.to_bitcoin_network(), Network::Signet);
        assert_eq!(NetworkMode::Mutinynet.to_bitcoin_network(), Network::Signet);
        assert_eq!(NetworkMode::Regtest.to_bitcoin_network(), Network::Regtest);
        assert_eq!(NetworkMode::Signet.label(), "signet");
        assert_eq!(NetworkMode::Mutinynet.label(), "mutinynet");
        assert_eq!(NetworkMode::Regtest.label(), "regtest");
    }
}
