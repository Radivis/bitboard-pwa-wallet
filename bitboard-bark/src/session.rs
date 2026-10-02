use std::cell::{Cell, RefCell};
use std::sync::Arc;

use bip39::Mnemonic;
use bitcoin::Network;
use wasm_bindgen::prelude::*;

use crate::board::clear_prepared_board_funding;
use crate::record_store::SharedRecordStore;
use crate::sync_gate::BarkSessionSyncGate;
use crate::{
    BARK_MAINNET_ESPLORA_URL, BARK_MAINNET_SERVER_URL, BARK_SIGNET_ESPLORA_URL,
    BARK_SIGNET_SERVER_URL,
};

thread_local! {
    static ACTIVE_WALLET: RefCell<Option<bark::Wallet>> = const { RefCell::new(None) };
    static ACTIVE_RECORD_STORE: RefCell<Option<SharedRecordStore>> = const { RefCell::new(None) };
    static SESSION_SYNC_GATE: RefCell<BarkSessionSyncGate> =
        const { RefCell::new(BarkSessionSyncGate::new()) };
    static ACTIVE_BITCOIN_NETWORK: Cell<Option<Network>> = const { Cell::new(None) };
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

fn parse_open_network(network: &str) -> Result<Network, String> {
    match network {
        "signet" => Ok(Network::Signet),
        "mainnet" => Ok(Network::Bitcoin),
        other => Err(format!("Bark network {other} is not supported")),
    }
}

fn session_endpoints(network: Network) -> Result<(&'static str, &'static str), String> {
    match network {
        Network::Signet => Ok((BARK_SIGNET_SERVER_URL, BARK_SIGNET_ESPLORA_URL)),
        Network::Bitcoin => Ok((BARK_MAINNET_SERVER_URL, BARK_MAINNET_ESPLORA_URL)),
        _ => Err(format!("Bark network {network:?} is not supported")),
    }
}

fn config_for_network(network: Network) -> Result<bark::Config, String> {
    let (server_address, esplora_address) = session_endpoints(network)?;
    // `server_access_token` is deprecated since bark-wallet 0.2.4: the server does not
    // enforce it, and the field will be removed. `Config::network_default` still sets it,
    // and bark-wallet 0.7.1 has no replacement constructor, so the struct update copies it.
    #[allow(deprecated)]
    Ok(bark::Config {
        server_address: server_address.to_owned(),
        esplora_address: Some(esplora_address.to_owned()),
        user_agent: Some(bark_user_agent()),
        ..bark::Config::network_default(network)
    })
}

fn remember_session_network(network: Network) {
    ACTIVE_BITCOIN_NETWORK.with(|slot| slot.set(Some(network)));
}

fn clear_session_network() {
    ACTIVE_BITCOIN_NETWORK.with(|slot| slot.set(None));
}

pub(crate) fn session_bitcoin_network() -> Result<Network, String> {
    ACTIVE_BITCOIN_NETWORK.with(|slot| {
        slot.get()
            .ok_or_else(|| "Bark session is not open".to_owned())
    })
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

fn install_record_store(store: SharedRecordStore) -> Result<(), String> {
    ACTIVE_RECORD_STORE.with(|slot| {
        let mut current = slot
            .try_borrow_mut()
            .map_err(|_| "Bark record store is already borrowed".to_owned())?;
        current.take();
        *current = Some(store);
        Ok(())
    })
}

fn clear_record_store() {
    ACTIVE_RECORD_STORE.with(|slot| {
        if let Ok(mut current) = slot.try_borrow_mut() {
            current.take();
        }
    });
}

fn export_active_record_dump() -> Result<String, String> {
    ACTIVE_RECORD_STORE.with(|slot| {
        let current = slot
            .try_borrow()
            .map_err(|_| "Bark record store is already borrowed".to_owned())?;
        let store = current
            .as_ref()
            .ok_or_else(|| "Bark session is not open".to_owned())?;
        store.export_encoded_dump()
    })
}

async fn open_network_session(
    mnemonic_plaintext: String,
    network: Network,
    record_dump: String,
) -> Result<String, String> {
    let seed = {
        let mnemonic_guard = MnemonicPlaintext(mnemonic_plaintext);
        let parsed_mnemonic =
            Mnemonic::parse(mnemonic_guard.0.as_str()).map_err(|err| err.to_string())?;
        bark::WalletSeed::new_from_mnemonic(network, &parsed_mnemonic)
    };
    let config = config_for_network(network)?;

    let store = if record_dump.is_empty() {
        SharedRecordStore::empty()
    } else {
        SharedRecordStore::from_encoded_dump(&record_dump)?
    };

    install_record_store(store.clone())?;
    let persister = Arc::new(bark::persist::adaptor::StorageAdaptorWrapper::new(store));
    let opened = bark::Wallet::open(
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
    .await;
    let wallet = match opened {
        Ok(wallet) => wallet,
        Err(err) => {
            clear_record_store();
            clear_session_network();
            return Err(format!("{err:#}"));
        }
    };

    let fingerprint = wallet.fingerprint().to_string();
    if let Err(err) = store_wallet(wallet) {
        clear_record_store();
        clear_session_network();
        return Err(err);
    }
    remember_session_network(network);
    clear_session_sync_gate();
    Ok(fingerprint)
}

fn clear_session_sync_gate() {
    SESSION_SYNC_GATE.with(|gate| gate.borrow_mut().clear());
}

fn mark_session_synced() {
    SESSION_SYNC_GATE.with(|gate| gate.borrow_mut().mark_synced());
}

pub(crate) fn require_session_synced() -> Result<(), String> {
    SESSION_SYNC_GATE.with(|gate| gate.borrow().require_synced().map_err(str::to_owned))
}

fn drop_active_wallet() -> Result<(), String> {
    ACTIVE_WALLET.with(|wallet_cell| -> Result<(), String> {
        let mut slot = wallet_cell
            .try_borrow_mut()
            .map_err(|_| "Bark session is already borrowed".to_owned())?;
        slot.take();
        Ok(())
    })?;
    clear_record_store();
    clear_session_network();
    clear_session_sync_gate();
    clear_prepared_board_funding();
    Ok(())
}

/// Opens or creates a Bark wallet for `signet` or `mainnet` on the in-memory record store.
///
/// `record_dump` is empty when this network has no encrypted dump yet.
/// The custom persister is set, so Bark does not open IndexedDB.
#[wasm_bindgen]
pub async fn bark_open_session(
    mnemonic: String,
    network: String,
    record_dump: String,
) -> Result<String, JsValue> {
    let bitcoin_network = parse_open_network(&network).map_err(|err| JsValue::from_str(&err))?;
    open_network_session(mnemonic, bitcoin_network, record_dump)
        .await
        .map_err(|err| JsValue::from_str(&err))
}

/// Exports the open network's record dump. Plaintext stays in this worker.
#[wasm_bindgen]
pub fn bark_export_record_dump() -> Result<String, JsValue> {
    export_active_record_dump().map_err(|err| JsValue::from_str(&err))
}

/// Drops the in-memory wallet and record store.
#[wasm_bindgen]
pub fn bark_close_session() -> Result<(), JsValue> {
    drop_active_wallet().map_err(|err| JsValue::from_str(&err))
}

pub(crate) fn take_active_wallet() -> Result<bark::Wallet, String> {
    ACTIVE_WALLET.with(|wallet_cell| {
        let mut slot = wallet_cell
            .try_borrow_mut()
            .map_err(|_| "Bark session is already borrowed".to_owned())?;
        slot.take()
            .ok_or_else(|| "Bark session is not open".to_owned())
    })
}

pub(crate) fn finish_wallet_operation<T>(
    wallet: bark::Wallet,
    operation_result: Result<T, String>,
) -> Result<T, String> {
    let restore_result = store_wallet(wallet);
    match (operation_result, restore_result) {
        (Ok(value), Ok(())) => Ok(value),
        (Err(operation_error), _) => Err(operation_error),
        (Ok(_), Err(restore_error)) => Err(restore_error),
    }
}

pub(crate) fn bark_error(err: impl std::fmt::Display) -> String {
    format!("{err:#}")
}

/// Address and key index from `Wallet::new_address_with_index`.
#[wasm_bindgen]
pub struct BarkRevealedReceiveAddress {
    address: String,
    index: u32,
}

#[wasm_bindgen]
impl BarkRevealedReceiveAddress {
    #[wasm_bindgen(getter)]
    pub fn address(&self) -> String {
        self.address.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn index(&self) -> u32 {
        self.index
    }
}

/// Peeks an already stored receive key. Does not derive or store a new key.
#[wasm_bindgen]
pub async fn bark_peek_receive_address(index: u32) -> Result<String, JsValue> {
    let wallet = take_active_wallet().map_err(|err| JsValue::from_str(&err))?;
    let operation_result = async {
        let address = wallet.peek_address(index).await.map_err(bark_error)?;
        Ok(address.to_string())
    }
    .await;
    finish_wallet_operation(wallet, operation_result).map_err(|err| JsValue::from_str(&err))
}

/// Derives and stores the next Bark receive address.
#[wasm_bindgen]
pub async fn bark_reveal_next_address() -> Result<BarkRevealedReceiveAddress, JsValue> {
    let wallet = take_active_wallet().map_err(|err| JsValue::from_str(&err))?;
    let operation_result = async {
        let (address, index) = wallet.new_address_with_index().await.map_err(bark_error)?;
        Ok(BarkRevealedReceiveAddress {
            address: address.to_string(),
            index,
        })
    }
    .await;
    finish_wallet_operation(wallet, operation_result).map_err(|err| JsValue::from_str(&err))
}

/// Last stored VTXO key index, or `null` when Bark has not stored one.
/// `peek_next_keypair` does not store a key. The next index is `0` when none exist.
#[wasm_bindgen]
pub async fn bark_last_revealed_key_index() -> Result<JsValue, JsValue> {
    let wallet = take_active_wallet().map_err(|err| JsValue::from_str(&err))?;
    let operation_result = async {
        let (_keypair, next_index) = wallet.peek_next_keypair().await.map_err(bark_error)?;
        if next_index == 0 {
            Ok(None)
        } else {
            Ok(Some(next_index - 1))
        }
    }
    .await;
    match finish_wallet_operation(wallet, operation_result) {
        Ok(Some(index)) => Ok(JsValue::from(index)),
        Ok(None) => Ok(JsValue::NULL),
        Err(err) => Err(JsValue::from_str(&err)),
    }
}

/// Heartbeats the Signet server, then runs `Wallet::sync` and drives pending boards.
/// `Wallet::sync` returns `()` and only logs sub-step failures, so a dead server
/// is reported by `refresh_server` and does not mark this session as synced.
/// `sync_pending_boards` parks a board while it waits for confirmations.
#[wasm_bindgen]
pub async fn bark_sync() -> Result<(), JsValue> {
    let wallet = take_active_wallet().map_err(|err| JsValue::from_str(&err))?;
    let operation_result = async {
        wallet.refresh_server().await.map_err(bark_error)?;
        wallet.sync().await;
        wallet.sync_pending_boards().await.map_err(bark_error)?;
        Ok(())
    }
    .await;
    finish_wallet_operation(wallet, operation_result).map_err(|err| JsValue::from_str(&err))?;
    mark_session_synced();
    Ok(())
}

fn spendable_sats(balance: &bark::Balance) -> u64 {
    balance.spendable.to_sat()
}

/// Spendable satoshis. Refused until `bark_sync` has succeeded in this session.
#[wasm_bindgen]
pub async fn bark_balance() -> Result<u64, JsValue> {
    require_session_synced().map_err(|err| JsValue::from_str(&err))?;
    let wallet = take_active_wallet().map_err(|err| JsValue::from_str(&err))?;
    let operation_result = async {
        let balance = wallet.balance().await.map_err(bark_error)?;
        Ok(spendable_sats(&balance))
    }
    .await;
    finish_wallet_operation(wallet, operation_result).map_err(|err| JsValue::from_str(&err))
}
