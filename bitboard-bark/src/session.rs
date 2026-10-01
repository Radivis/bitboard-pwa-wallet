use std::cell::RefCell;

use bip39::Mnemonic;
use bitcoin::Network;
use wasm_bindgen::prelude::*;

use crate::{BARK_SIGNET_ESPLORA_URL, BARK_SIGNET_SERVER_URL};

thread_local! {
    static ACTIVE_WALLET: RefCell<Option<bark::Wallet>> = const { RefCell::new(None) };
}

/// Zeros the mnemonic phrase once the seed has been derived.
struct MnemonicPlaintext(String);

impl Drop for MnemonicPlaintext {
    fn drop(&mut self) {
        let mut bytes = std::mem::take(&mut self.0).into_bytes();
        bytes.fill(0);
        std::hint::black_box(bytes);
    }
}

fn bark_user_agent() -> String {
    format!("bitboard/{}", env!("CARGO_PKG_VERSION"))
}

fn signet_config() -> bark::Config {
    #[allow(deprecated)]
    bark::Config {
        server_address: BARK_SIGNET_SERVER_URL.to_owned(),
        esplora_address: Some(BARK_SIGNET_ESPLORA_URL.to_owned()),
        user_agent: Some(bark_user_agent()),
        ..bark::Config::network_default(Network::Signet)
    }
}

fn store_wallet(wallet: bark::Wallet) -> Result<(), String> {
    ACTIVE_WALLET.with(|wallet_cell| {
        let mut slot = wallet_cell
            .try_borrow_mut()
            .map_err(|_| "Bark session is already borrowed".to_owned())?;
        slot.take();
        *slot = Some(wallet);
        Ok(())
    })
}

async fn open_signet_session(mnemonic_plaintext: String) -> Result<String, String> {
    let seed = {
        let mnemonic_guard = MnemonicPlaintext(mnemonic_plaintext);
        let parsed_mnemonic =
            Mnemonic::parse(mnemonic_guard.0.as_str()).map_err(|err| err.to_string())?;
        bark::WalletSeed::new_from_mnemonic(Network::Signet, &parsed_mnemonic)
    };

    let wallet = bark::Wallet::open(
        Network::Signet,
        seed,
        signet_config(),
        bark::OpenWalletArgs {
            run_daemon: false,
            onchain: None,
            create_if_not_exists: true,
            ..bark::OpenWalletArgs::default()
        },
    )
    .await
    .map_err(|err| format!("{err:#}"))?;

    let fingerprint = wallet.fingerprint().to_string();
    store_wallet(wallet)?;
    Ok(fingerprint)
}

fn drop_active_wallet() -> Result<(), String> {
    ACTIVE_WALLET.with(|wallet_cell| {
        let mut slot = wallet_cell
            .try_borrow_mut()
            .map_err(|_| "Bark session is already borrowed".to_owned())?;
        slot.take();
        Ok(())
    })
}

/// Opens or creates a public-Signet Bark wallet. Protocol state stays in IndexedDB.
#[wasm_bindgen]
pub async fn bark_open_session(mnemonic: String) -> Result<String, JsValue> {
    open_signet_session(mnemonic)
        .await
        .map_err(|err| JsValue::from_str(&err))
}

/// Drops the thread-local wallet so the IndexedDB connection closes. Does not delete the database.
#[wasm_bindgen]
pub fn bark_close_session() -> Result<(), JsValue> {
    drop_active_wallet().map_err(|err| JsValue::from_str(&err))
}
