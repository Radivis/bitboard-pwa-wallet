mod balance;
mod boarding;
mod exit;
pub(crate) mod mappers;
mod open;
mod payments;
mod pending_exit;
mod receive;
mod sync;
mod vtxo;

use std::sync::Arc;
use std::time::Duration;

use ark_bdk_wallet::Wallet as ArkBdkWallet;
use ark_client::{Bip32KeyProvider, Client, InMemorySwapStorage};
use ark_delegator::DelegatorClient;
use bitcoin::Network;

use crate::esplora_blockchain::EsploraBlockchain;
use crate::network::NetworkMode;
use crate::persistence::{JsonPersistenceDb, OperatorIdentity, SharedPersistenceDb};

pub(crate) const CLIENT_NAME: &str = "bitboard-pwa-wallet";
pub(crate) const BOLTZ_URL: &str = "https://api.boltz.exchange";
pub(crate) const CLIENT_TIMEOUT: Duration = Duration::from_secs(30);

pub type ArkWallet = ArkBdkWallet<SharedPersistenceDb>;
pub type ArkClient = Client<EsploraBlockchain, ArkWallet, InMemorySwapStorage, Bip32KeyProvider>;

pub struct ArkSession {
    client: ArkClient,
    wallet_db: Arc<JsonPersistenceDb>,
    delegator: Option<DelegatorClient>,
    network_mode: NetworkMode,
    operator_identity: OperatorIdentity,
}

impl ArkSession {
    pub(crate) fn network(&self) -> Network {
        self.network_mode.to_bitcoin_network()
    }
}
