use std::cell::RefCell;

use bdk_wallet::chain::Merge;
use bdk_wallet::{ChangeSet, KeychainKind, Wallet as BdkWallet};
use wasm_bindgen::prelude::*;

/// Current Unix time in seconds. Used for sync/full_scan request building so production and tests use the same `_at(now)` API.
pub(crate) fn current_unix_time() -> u64 {
    #[cfg(target_arch = "wasm32")]
    {
        (js_sys::Date::now() / 1000.0) as u64
    }
    #[cfg(not(target_arch = "wasm32"))]
    {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("system time before UNIX_EPOCH")
            .as_secs()
    }
}

pub mod blockchain;
pub mod descriptors;
pub mod error;
use crate::error::{
    CODE_NO_ACTIVE_WALLET, CODE_WALLET_ALREADY_BORROWED, CODE_WALLET_NOT_LOADED_FOR_LAB,
    MSG_NO_ACTIVE_WALLET, MSG_WALLET_ALREADY_BORROWED, MSG_WALLET_NOT_LOADED_FOR_LAB,
    MapDisplayErrToJs, MapErrToJs, wasm_crypto_error,
};
pub mod esplora;
pub mod lab;
pub mod lab_entity_wallet;
pub mod lab_psbt;
pub mod mnemonic;
pub mod sync;
pub mod transaction;
pub mod types;
pub mod validation;
pub mod wallet;
pub mod wallet_session;
pub mod wasm_sleep;

#[cfg(test)]
mod tests;

#[wasm_bindgen(start)]
pub fn init() {
    console_error_panic_hook::set_once();
}

thread_local! {
    static ACTIVE_WALLET: RefCell<Option<BdkWallet>> = const { RefCell::new(None) };
    static ACCUMULATED_CHANGESET: RefCell<ChangeSet> = RefCell::new(ChangeSet::default());
    static EXTERNAL_DESCRIPTOR_FOR_LAB: RefCell<String> = const { RefCell::new(String::new()) };
    static INTERNAL_DESCRIPTOR_FOR_LAB: RefCell<String> = const { RefCell::new(String::new()) };
}

fn with_wallet<F, R>(wallet_callback: F) -> Result<R, JsValue>
where
    F: FnOnce(&BdkWallet) -> R,
{
    ACTIVE_WALLET.with(|wallet_cell| {
        let borrow = wallet_cell.try_borrow().map_err(|_| {
            wasm_crypto_error(CODE_WALLET_ALREADY_BORROWED, MSG_WALLET_ALREADY_BORROWED)
        })?;
        let wallet_ref = borrow
            .as_ref()
            .ok_or_else(|| wasm_crypto_error(CODE_NO_ACTIVE_WALLET, MSG_NO_ACTIVE_WALLET))?;
        Ok(wallet_callback(wallet_ref))
    })
}

fn with_wallet_mut<F, R>(wallet_callback: F) -> Result<R, JsValue>
where
    F: FnOnce(&mut BdkWallet) -> R,
{
    ACTIVE_WALLET.with(|wallet_cell| {
        let mut borrow = wallet_cell.try_borrow_mut().map_err(|_| {
            wasm_crypto_error(CODE_WALLET_ALREADY_BORROWED, MSG_WALLET_ALREADY_BORROWED)
        })?;
        let wallet_ref = borrow
            .as_mut()
            .ok_or_else(|| wasm_crypto_error(CODE_NO_ACTIVE_WALLET, MSG_NO_ACTIVE_WALLET))?;
        Ok(wallet_callback(wallet_ref))
    })
}

/// Collect any staged changes from the wallet and merge them into the accumulator.
fn accumulate_staged_changes() {
    ACTIVE_WALLET.with(|wallet_cell| {
        let mut borrow = wallet_cell.borrow_mut();
        if let Some(wallet_ref) = borrow.as_mut()
            && let Some(staged) = wallet_ref.take_staged()
        {
            ACCUMULATED_CHANGESET.with(|changeset_cell| {
                changeset_cell.borrow_mut().merge(staged);
            });
        }
    });
}

// ---------------------------------------------------------------------------
// Mnemonic / descriptor wrappers (Phase 3)
// ---------------------------------------------------------------------------

#[wasm_bindgen]
pub fn generate_mnemonic(word_count: u32) -> Result<String, JsValue> {
    mnemonic::generate_mnemonic(word_count).map_err(Into::into)
}

#[wasm_bindgen]
pub fn validate_mnemonic(mnemonic_str: &str) -> Result<bool, JsValue> {
    match mnemonic::validate_mnemonic(mnemonic_str) {
        Ok(()) => Ok(true),
        Err(_) => Ok(false),
    }
}

#[wasm_bindgen]
pub fn derive_descriptors(
    mnemonic_str: &str,
    network: &str,
    address_type: &str,
    account_id: u32,
) -> Result<JsValue, JsValue> {
    let network = types::BitcoinNetwork::try_from(network).map_err(JsValue::from)?;
    let addr_type = types::AddressType::try_from(address_type).map_err(JsValue::from)?;

    let pair = descriptors::derive_descriptors(mnemonic_str, network, addr_type, account_id)
        .map_err(JsValue::from)?;

    serde_wasm_bindgen::to_value(&pair).map_display_err_to_js()
}

// ---------------------------------------------------------------------------
// Wallet wrappers
// ---------------------------------------------------------------------------

/// Create a new wallet from a mnemonic, network, address type, and account index.
///
/// Derives descriptors internally, creates the BDK wallet, stores it in
/// thread-local state, and returns a `CreateWalletResult` as JsValue.
#[wasm_bindgen]
pub fn create_wallet(
    mnemonic_str: &str,
    network: &str,
    address_type: &str,
    account_id: u32,
) -> Result<JsValue, JsValue> {
    let bitcoin_network = types::BitcoinNetwork::try_from(network).map_err(JsValue::from)?;
    let addr_type = types::AddressType::try_from(address_type).map_err(JsValue::from)?;

    let pair =
        descriptors::derive_descriptors(mnemonic_str, bitcoin_network, addr_type, account_id)
            .map_err(JsValue::from)?;

    let mut bdk_wallet = wallet::create_wallet(&pair.external, &pair.internal, bitcoin_network)
        .map_err(JsValue::from)?;

    let first_address = wallet::get_new_address(&mut bdk_wallet);

    let initial_changeset = bdk_wallet.take_staged().unwrap_or_default();

    let changeset_json = wallet::serialize_changeset(&initial_changeset).map_err(JsValue::from)?;

    ACTIVE_WALLET.with(|wallet_cell| wallet_cell.replace(Some(bdk_wallet)));
    ACCUMULATED_CHANGESET.with(|changeset_cell| *changeset_cell.borrow_mut() = initial_changeset);
    EXTERNAL_DESCRIPTOR_FOR_LAB
        .with(|descriptor_cell| *descriptor_cell.borrow_mut() = pair.external.clone());
    INTERNAL_DESCRIPTOR_FOR_LAB
        .with(|descriptor_cell| *descriptor_cell.borrow_mut() = pair.internal.clone());

    let create_wallet_payload = types::CreateWalletResult {
        external_descriptor: pair.external,
        internal_descriptor: pair.internal,
        first_address,
        changeset_json,
    };

    serde_wasm_bindgen::to_value(&create_wallet_payload).map_display_err_to_js()
}

/// Load a previously persisted wallet from descriptors and a changeset JSON.
///
/// When `use_empty_chain` is true, the wallet is created fresh with the same descriptors
/// (ignoring `changeset_json`) so the next sync uses the correct chain genesis. The UI
/// uses this only as a **fallback** after a normal load fails (network/genesis mismatch or
/// unloadable changeset), not for every testnet load — otherwise switching networks would
/// discard persisted tx state. For that fallback on testnet, BDK's Testnet4 matches
/// default Esplora. BDK's load returns None for an empty changeset, so we use create +
/// take_staged instead of load.
#[wasm_bindgen]
pub fn load_wallet(
    external_descriptor: &str,
    internal_descriptor: &str,
    network: &str,
    changeset_json: &str,
    use_empty_chain: bool,
) -> Result<JsValue, JsValue> {
    let bitcoin_network = types::BitcoinNetwork::try_from(network).map_err(JsValue::from)?;

    let (bdk_wallet, changeset) = wallet_session::open_wallet_from_descriptors(
        external_descriptor,
        internal_descriptor,
        bitcoin_network,
        changeset_json,
        use_empty_chain,
    )
    .map_err(JsValue::from)?;

    ACTIVE_WALLET.with(|wallet_cell| wallet_cell.replace(Some(bdk_wallet)));
    ACCUMULATED_CHANGESET.with(|changeset_cell| *changeset_cell.borrow_mut() = changeset);
    EXTERNAL_DESCRIPTOR_FOR_LAB
        .with(|descriptor_cell| *descriptor_cell.borrow_mut() = external_descriptor.to_string());
    INTERNAL_DESCRIPTOR_FOR_LAB
        .with(|descriptor_cell| *descriptor_cell.borrow_mut() = internal_descriptor.to_string());

    Ok(JsValue::TRUE)
}

/// Reveal the next external address from the active wallet.
#[wasm_bindgen]
pub fn get_new_address() -> Result<String, JsValue> {
    let address = with_wallet_mut(wallet::get_new_address)?;
    accumulate_staged_changes();
    Ok(address)
}

/// Return the last revealed external address without incrementing the index.
#[wasm_bindgen]
pub fn get_current_address() -> Result<String, JsValue> {
    with_wallet(wallet::get_current_address)
}

/// Return the active wallet's balance as a `BalanceInfo` JsValue.
#[wasm_bindgen]
pub fn get_balance() -> Result<JsValue, JsValue> {
    let balance = with_wallet(wallet::get_balance)?;
    Ok(serde_wasm_bindgen::to_value(&balance)?)
}

/// Export the full accumulated changeset as a JSON string.
///
/// This includes all changes since the wallet was created or loaded,
/// giving the frontend the complete state needed to reconstruct the wallet.
#[wasm_bindgen]
pub fn export_changeset() -> Result<String, JsValue> {
    accumulate_staged_changes();
    ACCUMULATED_CHANGESET.with(|changeset_cell| {
        wallet::serialize_changeset(&changeset_cell.borrow()).map_err(JsValue::from)
    })
}

// ---------------------------------------------------------------------------
// Sync & transaction wrappers
// ---------------------------------------------------------------------------
//
// Sync behavior: we rely on BDK for reorg/duplicate handling; empty update is
// safe (apply_update is all-or-nothing per call). Use full_scan after
// create/import; use sync_wallet for incremental updates.
// The sync module (sync::sync_wallet / full_scan_wallet) is used by tests with
// a mock BlockchainClient; the WASM entrypoints here use EsploraClient directly.

const PARALLEL_REQUESTS: usize = 5;
/// Full scan is bursty; lower concurrency reduces 429s on public Esplora hosts.
const FULL_SCAN_PARALLEL_REQUESTS: usize = 2;

fn to_js<T: serde::Serialize>(value: &T) -> Result<JsValue, JsValue> {
    serde_wasm_bindgen::to_value(value).map_display_err_to_js()
}

/// Sync the active wallet against an Esplora server (incremental).
///
/// Returns a `SyncResult` with updated balance and changeset JSON.
#[wasm_bindgen]
pub async fn sync_wallet(esplora_url: &str) -> Result<JsValue, JsValue> {
    let client = esplora::EsploraClient::new(esplora_url).map_err(JsValue::from)?;

    let sync_request =
        with_wallet(|wallet| wallet.start_sync_with_revealed_spks_at(current_unix_time()))?;

    use bdk_esplora::EsploraAsyncExt;
    let update: bdk_wallet::Update = client
        .inner()
        .sync(sync_request, PARALLEL_REQUESTS)
        .await
        .map_display_err_to_js()?
        .into();

    with_wallet_mut(|wallet| sync::apply_update(wallet, update).map_err(JsValue::from))??;

    accumulate_staged_changes();
    build_sync_result()
}

/// Full scan the active wallet against an Esplora server.
///
/// Use after wallet creation or import to discover historical transactions.
/// Returns a `SyncResult` with updated balance and changeset JSON.
#[wasm_bindgen]
pub async fn full_scan_wallet(esplora_url: &str, stop_gap: usize) -> Result<JsValue, JsValue> {
    let client = esplora::EsploraClient::new(esplora_url).map_err(JsValue::from)?;

    let scan_request = with_wallet(|wallet| wallet.start_full_scan_at(current_unix_time()))?;

    use bdk_esplora::EsploraAsyncExt;
    let update: bdk_wallet::Update = client
        .inner()
        .full_scan(scan_request, stop_gap, FULL_SCAN_PARALLEL_REQUESTS)
        .await
        .map_display_err_to_js()?
        .into();

    with_wallet_mut(|wallet| sync::apply_update(wallet, update).map_err(JsValue::from))??;

    accumulate_staged_changes();
    build_sync_result()
}

fn build_sync_result() -> Result<JsValue, JsValue> {
    let balance = with_wallet(wallet::get_balance)?;
    let changeset_json = export_changeset()?;
    let sync_result_payload = types::SyncResult {
        balance,
        changeset_json,
    };
    to_js(&sync_result_payload)
}

/// Prepare an on-chain send: applies dust UX clamp; change-free bump only when
/// `apply_change_free_bump` is true (after user confirms in the UI).
/// Returns JSON including `change_free_bump_available`, `change_free_max_sats`.
#[wasm_bindgen]
pub fn prepare_onchain_send_transaction(
    recipient_address: &str,
    amount_sats: u64,
    fee_rate_sat_per_vb: f64,
    network: &str,
    apply_change_free_bump: bool,
) -> Result<JsValue, JsValue> {
    let bitcoin_network = types::BitcoinNetwork::try_from(network).map_err(JsValue::from)?;
    let outcome = with_wallet_mut(|wallet| {
        transaction::prepare_onchain_send(
            wallet,
            recipient_address,
            amount_sats,
            fee_rate_sat_per_vb,
            bitcoin_network.into(),
            apply_change_free_bump,
        )
    })?
    .map_err(JsValue::from)?;

    accumulate_staged_changes();
    serde_wasm_bindgen::to_value(&outcome).map_display_err_to_js()
}

/// Build a transaction from the active wallet.
///
/// Returns the PSBT serialized as a base64 string.
/// Prefer [`prepare_onchain_send_transaction`] for UX adjustments; this uses the same preparation
/// and returns only the PSBT string.
#[wasm_bindgen]
pub fn build_transaction(
    recipient_address: &str,
    amount_sats: u64,
    fee_rate_sat_per_vb: f64,
    network: &str,
) -> Result<String, JsValue> {
    let bitcoin_network = types::BitcoinNetwork::try_from(network).map_err(JsValue::from)?;
    let outcome = with_wallet_mut(|wallet| {
        transaction::prepare_onchain_send(
            wallet,
            recipient_address,
            amount_sats,
            fee_rate_sat_per_vb,
            bitcoin_network.into(),
            false,
        )
    })?
    .map_err(JsValue::from)?;

    accumulate_staged_changes();
    Ok(outcome.psbt_base64)
}

/// Sign a PSBT and extract the finalized transaction.
///
/// Takes a PSBT as base64 string, returns the signed raw transaction as hex.
#[wasm_bindgen]
pub fn sign_and_extract_transaction(psbt_base64: &str) -> Result<String, JsValue> {
    let mut psbt: bitcoin::Psbt = psbt_base64
        .parse()
        .map_err(|e: bitcoin::psbt::PsbtParseError| JsValue::from_str(&e.to_string()))?;

    with_wallet(|wallet| transaction::sign_transaction(wallet, &mut psbt))?
        .map_err(JsValue::from)?;

    let tx = transaction::extract_transaction(psbt).map_err(JsValue::from)?;
    Ok(bitcoin::consensus::encode::serialize_hex(&tx))
}

/// Broadcast a signed transaction via an Esplora server.
///
/// Takes the raw transaction hex and Esplora URL, returns the txid string.
#[wasm_bindgen]
pub async fn broadcast_transaction(raw_tx_hex: &str, esplora_url: &str) -> Result<String, JsValue> {
    let tx_bytes = bitcoin::consensus::encode::deserialize_hex::<bitcoin::Transaction>(raw_tx_hex)
        .map_display_err_to_js()?;

    let client = esplora::EsploraClient::new(esplora_url).map_err(JsValue::from)?;

    use crate::blockchain::BlockchainClient;
    let txid = client.broadcast(&tx_bytes).await.map_err(JsValue::from)?;

    Ok(txid.to_string())
}

/// Return all wallet transactions as a JSON array of `TransactionDetails`.
#[wasm_bindgen]
pub fn get_transaction_list() -> Result<JsValue, JsValue> {
    let tx_list = with_wallet(wallet::get_transaction_list)?;
    to_js(&tx_list)
}

// ---------------------------------------------------------------------------
// Lab build and sign (wallet-based, PSBT path)
// ---------------------------------------------------------------------------

/// Build and sign a lab transaction using BDK's add_foreign_utxo.
/// Returns JSON including dust UX fields (see [`lab_psbt::LabPrepareSendOutcome`]).
#[wasm_bindgen]
pub fn build_and_sign_lab_transaction(
    utxos_json: &str,
    to_address: &str,
    amount_sats: u64,
    fee_rate_sat_per_vb: f64,
    change_address: &str,
    apply_change_free_bump: bool,
) -> Result<JsValue, JsValue> {
    let external =
        EXTERNAL_DESCRIPTOR_FOR_LAB.with(|descriptor_cell| descriptor_cell.borrow().clone());
    let internal =
        INTERNAL_DESCRIPTOR_FOR_LAB.with(|descriptor_cell| descriptor_cell.borrow().clone());
    if external.is_empty() || internal.is_empty() {
        return Err(wasm_crypto_error(
            CODE_WALLET_NOT_LOADED_FOR_LAB,
            MSG_WALLET_NOT_LOADED_FOR_LAB,
        ));
    }

    let lab_prepare_outcome = with_wallet_mut(|wallet| {
        lab_psbt::prepare_build_and_sign_lab_transaction(
            wallet,
            utxos_json,
            to_address,
            amount_sats,
            fee_rate_sat_per_vb,
            change_address,
            apply_change_free_bump,
        )
    })?;
    let outcome = lab_prepare_outcome.map_err_to_js()?;
    serde_wasm_bindgen::to_value(&outcome).map_display_err_to_js()
}

/// Unsigned lab PSBT draft for preview before signing (dust / change-free metadata only).
#[wasm_bindgen]
pub fn draft_lab_psbt_transaction(
    utxos_json: &str,
    to_address: &str,
    amount_sats: u64,
    fee_rate_sat_per_vb: f64,
    change_address: &str,
    apply_change_free_bump: bool,
) -> Result<JsValue, JsValue> {
    let external =
        EXTERNAL_DESCRIPTOR_FOR_LAB.with(|descriptor_cell| descriptor_cell.borrow().clone());
    let internal =
        INTERNAL_DESCRIPTOR_FOR_LAB.with(|descriptor_cell| descriptor_cell.borrow().clone());
    if external.is_empty() || internal.is_empty() {
        return Err(wasm_crypto_error(
            CODE_WALLET_NOT_LOADED_FOR_LAB,
            MSG_WALLET_NOT_LOADED_FOR_LAB,
        ));
    }

    let lab_draft_outcome = with_wallet_mut(|wallet| {
        lab_psbt::prepare_lab_psbt_draft(
            wallet,
            utxos_json,
            to_address,
            amount_sats,
            fee_rate_sat_per_vb,
            change_address,
            apply_change_free_bump,
        )
    })?;
    let outcome = lab_draft_outcome.map_err_to_js()?;
    serde_wasm_bindgen::to_value(&outcome).map_display_err_to_js()
}

/// Return the first internal address for lab change outputs.
#[wasm_bindgen]
pub fn get_lab_change_address() -> Result<String, JsValue> {
    let internal =
        INTERNAL_DESCRIPTOR_FOR_LAB.with(|descriptor_cell| descriptor_cell.borrow().clone());
    if internal.is_empty() {
        return Err(wasm_crypto_error(
            CODE_WALLET_NOT_LOADED_FOR_LAB,
            MSG_WALLET_NOT_LOADED_FOR_LAB,
        ));
    }
    with_wallet(|wallet| {
        wallet
            .peek_address(KeychainKind::Internal, 0)
            .address
            .to_string()
    })
}

// ---------------------------------------------------------------------------
// Lab entity wallet (ephemeral BDK, no ACTIVE_WALLET)
// ---------------------------------------------------------------------------

/// Create a simulated lab-entity wallet from mnemonic. Does not touch the active user wallet.
#[wasm_bindgen]
pub fn create_lab_entity_wallet(
    mnemonic_str: &str,
    network: &str,
    address_type: &str,
    account_id: u32,
) -> Result<JsValue, JsValue> {
    let bitcoin_network = types::BitcoinNetwork::try_from(network).map_err(JsValue::from)?;
    let addr_type = types::AddressType::try_from(address_type).map_err(JsValue::from)?;
    let lab_entity_wallet_payload = lab_entity_wallet::create_lab_entity_wallet(
        mnemonic_str,
        bitcoin_network,
        addr_type,
        account_id,
    )
    .map_err(JsValue::from)?;
    serde_wasm_bindgen::to_value(&lab_entity_wallet_payload).map_display_err_to_js()
}

/// Last revealed external address for mining coinbase to a lab entity.
#[wasm_bindgen]
pub fn lab_entity_get_current_external_address(
    mnemonic_str: &str,
    changeset_json: &str,
    network: &str,
    address_type: &str,
    account_id: u32,
) -> Result<String, JsValue> {
    let bitcoin_network = types::BitcoinNetwork::try_from(network).map_err(JsValue::from)?;
    let addr_type = types::AddressType::try_from(address_type).map_err(JsValue::from)?;
    lab_entity_wallet::lab_entity_get_current_external_address(
        mnemonic_str,
        changeset_json,
        bitcoin_network,
        addr_type,
        account_id,
    )
    .map_err(JsValue::from)
}

/// Reveal next external address; returns JSON `{ address, changeset_json }`.
#[wasm_bindgen]
pub fn lab_entity_reveal_next_external_address(
    mnemonic_str: &str,
    changeset_json: &str,
    network: &str,
    address_type: &str,
    account_id: u32,
) -> Result<JsValue, JsValue> {
    let bitcoin_network = types::BitcoinNetwork::try_from(network).map_err(JsValue::from)?;
    let addr_type = types::AddressType::try_from(address_type).map_err(JsValue::from)?;
    let (address, changeset_json) = lab_entity_wallet::lab_entity_reveal_next_external_address(
        mnemonic_str,
        changeset_json,
        bitcoin_network,
        addr_type,
        account_id,
    )
    .map_err(JsValue::from)?;
    #[derive(serde::Serialize)]
    struct RevealResult {
        address: String,
        changeset_json: String,
    }
    serde_wasm_bindgen::to_value(&RevealResult {
        address,
        changeset_json,
    })
    .map_display_err_to_js()
}

/// Draft an unsigned lab PSBT for a lab entity (dust / change-free metadata; no persisted changes).
#[wasm_bindgen]
#[allow(clippy::too_many_arguments)] // wasm_bindgen exposes a flat JS API; arity stays fixed for WASM ABI.
pub fn lab_entity_draft_lab_psbt_transaction(
    mnemonic_str: &str,
    changeset_json: &str,
    network: &str,
    address_type: &str,
    account_id: u32,
    utxos_json: &str,
    to_address: &str,
    amount_sats: u64,
    fee_rate_sat_per_vb: f64,
) -> Result<JsValue, JsValue> {
    let bitcoin_network = types::BitcoinNetwork::try_from(network).map_err(JsValue::from)?;
    let addr_type = types::AddressType::try_from(address_type).map_err(JsValue::from)?;
    let draft_lab_psbt_payload = lab_entity_wallet::lab_entity_draft_lab_psbt_transaction(
        lab_entity_wallet::LabEntityDraftArgs {
            mnemonic: mnemonic_str,
            changeset_json,
            network: bitcoin_network,
            address_type: addr_type,
            account_id,
            utxos_json,
            to_address,
            amount_sats,
            fee_rate_sat_per_vb,
        },
    )
    .map_err(JsValue::from)?;
    serde_wasm_bindgen::to_value(&draft_lab_psbt_payload).map_display_err_to_js()
}

/// Build and sign a lab mempool tx for a lab entity. Returns JSON including updated `changeset_json`.
#[wasm_bindgen]
#[allow(clippy::too_many_arguments)] // wasm_bindgen exposes a flat JS API; arity stays fixed for WASM ABI.
pub fn lab_entity_build_and_sign_lab_transaction(
    mnemonic_str: &str,
    changeset_json: &str,
    network: &str,
    address_type: &str,
    account_id: u32,
    utxos_json: &str,
    to_address: &str,
    amount_sats: u64,
    fee_rate_sat_per_vb: f64,
    apply_change_free_bump: bool,
) -> Result<JsValue, JsValue> {
    let bitcoin_network = types::BitcoinNetwork::try_from(network).map_err(JsValue::from)?;
    let addr_type = types::AddressType::try_from(address_type).map_err(JsValue::from)?;
    let build_sign_lab_payload = lab_entity_wallet::lab_entity_build_and_sign_lab_transaction(
        lab_entity_wallet::LabEntityBuildSignArgs {
            mnemonic: mnemonic_str,
            changeset_json,
            network: bitcoin_network,
            address_type: addr_type,
            account_id,
            utxos_json,
            to_address,
            amount_sats,
            fee_rate_sat_per_vb,
            apply_change_free_bump,
        },
    )
    .map_err(JsValue::from)?;
    serde_wasm_bindgen::to_value(&build_sign_lab_payload).map_display_err_to_js()
}

// ---------------------------------------------------------------------------
// Ephemeral wallet session (no ACTIVE_WALLET; see wallet_session.rs)
// ---------------------------------------------------------------------------

#[wasm_bindgen]
pub struct WalletSession {
    session: wallet_session::WalletSession,
}

#[wasm_bindgen]
impl WalletSession {
    #[wasm_bindgen(constructor)]
    pub fn new(
        external_descriptor: &str,
        internal_descriptor: &str,
        network: &str,
        changeset_json: &str,
        use_empty_chain: bool,
    ) -> Result<WalletSession, JsValue> {
        let bitcoin_network = types::BitcoinNetwork::try_from(network).map_err(JsValue::from)?;
        let session = wallet_session::WalletSession::open(
            external_descriptor,
            internal_descriptor,
            bitcoin_network,
            changeset_json,
            use_empty_chain,
        )
        .map_err(JsValue::from)?;
        Ok(WalletSession { session })
    }

    pub fn get_balance(&self) -> Result<JsValue, JsValue> {
        let balance = self.session.get_balance();
        serde_wasm_bindgen::to_value(&balance).map_display_err_to_js()
    }

    pub fn export_changeset(&mut self) -> Result<String, JsValue> {
        self.session.export_changeset().map_err(JsValue::from)
    }
}
