use bitcoin::Network;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum NetworkMode {
    Mainnet,
    Testnet,
    Signet,
}

impl NetworkMode {
    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "mainnet" => Some(Self::Mainnet),
            "testnet" => Some(Self::Testnet),
            "signet" => Some(Self::Signet),
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
}
