//! Native opener for Bark regtest integration tests.
//!
//! Compiled only with `--features regtest-support`. It is not a wasm export
//! and it does not change `bark_open_session`.

use std::sync::Arc;

use bitcoin::Network;

use crate::record_store::SharedRecordStore;

pub struct RegtestBarkWallet {
    wallet: bark::Wallet,
    store: SharedRecordStore,
}

impl RegtestBarkWallet {
    /// Creates a wallet on an empty record store. The server must be up:
    /// `Wallet::open` handshakes before this returns.
    pub async fn open_empty(
        mnemonic: &str,
        server_url: &str,
        esplora_url: &str,
    ) -> Result<Self, String> {
        let network = Network::Regtest;
        let parsed_mnemonic = bip39::Mnemonic::parse(mnemonic).map_err(|err| err.to_string())?;
        let seed = bark::WalletSeed::new_from_mnemonic(network, &parsed_mnemonic);
        #[allow(deprecated)]
        let config = bark::Config {
            server_address: server_url.to_owned(),
            esplora_address: Some(esplora_url.to_owned()),
            user_agent: Some(format!("bitboard/{}", env!("CARGO_PKG_VERSION"))),
            ..bark::Config::network_default(network)
        };
        let store = SharedRecordStore::empty();
        let persister = Arc::new(bark::persist::adaptor::StorageAdaptorWrapper::new(
            store.clone(),
        ));
        let wallet = bark::Wallet::open(
            network,
            seed,
            config,
            bark::OpenWalletArgs {
                run_daemon: false,
                onchain: None,
                create_if_not_exists: true,
                persister: Some(persister),
                lock_manager: Some(Box::new(
                    bark::lock_manager::memory::MemoryLockManager::new(),
                )),
                ..bark::OpenWalletArgs::default()
            },
        )
        .await
        .map_err(|err| format!("{err:#}"))?;
        Ok(Self { wallet, store })
    }

    pub fn export_encoded_dump(&self) -> Result<String, String> {
        self.store.export_encoded_dump()
    }

    /// The product sync path calls this before `Wallet::sync`. `sync` returns
    /// `()` and only logs a server failure, so the fail-fast check is here.
    pub async fn refresh_server(&self) -> Result<(), String> {
        self.wallet
            .refresh_server()
            .await
            .map_err(|err| format!("{err:#}"))
    }
}
