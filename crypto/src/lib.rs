use std::cell::RefCell;

use bdk_wallet::chain::Merge;
use bdk_wallet::{ChangeSet, Wallet as BdkWallet};
use wasm_bindgen::prelude::*;

pub mod blockchain;
pub mod descriptors;
pub mod error;
pub mod mnemonic;
pub mod types;
pub mod wallet;

thread_local! {
    static ACTIVE_WALLET: RefCell<Option<BdkWallet>> = RefCell::new(None);
    static ACCUMULATED_CHANGESET: RefCell<ChangeSet> = RefCell::new(ChangeSet::default());
}

fn with_wallet<F, R>(op: F) -> Result<R, JsValue>
where
    F: FnOnce(&BdkWallet) -> R,
{
    ACTIVE_WALLET.with(|w| {
        let borrow = w.borrow();
        let wallet_ref = borrow
            .as_ref()
            .ok_or_else(|| JsValue::from_str("No active wallet. Call create_wallet or load_wallet first."))?;
        Ok(op(wallet_ref))
    })
}

fn with_wallet_mut<F, R>(op: F) -> Result<R, JsValue>
where
    F: FnOnce(&mut BdkWallet) -> R,
{
    ACTIVE_WALLET.with(|w| {
        let mut borrow = w.borrow_mut();
        let wallet_ref = borrow
            .as_mut()
            .ok_or_else(|| JsValue::from_str("No active wallet. Call create_wallet or load_wallet first."))?;
        Ok(op(wallet_ref))
    })
}

/// Collect any staged changes from the wallet and merge them into the accumulator.
fn accumulate_staged_changes() {
    ACTIVE_WALLET.with(|w| {
        let mut borrow = w.borrow_mut();
        if let Some(wallet_ref) = borrow.as_mut() {
            if let Some(staged) = wallet_ref.take_staged() {
                ACCUMULATED_CHANGESET.with(|cs| {
                    cs.borrow_mut().merge(staged);
                });
            }
        }
    });
}

// ---------------------------------------------------------------------------
// Mnemonic / descriptor wrappers (Phase 3)
// ---------------------------------------------------------------------------

#[wasm_bindgen]
pub fn greet(name: &str) -> String {
    format!("Hello from bitboard-crypto, {}!", name)
}

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
) -> Result<JsValue, JsValue> {
    let network = types::BitcoinNetwork::try_from(network).map_err(JsValue::from)?;
    let addr_type = types::AddressType::try_from(address_type).map_err(JsValue::from)?;

    let pair = descriptors::derive_descriptors(mnemonic_str, network, addr_type)
        .map_err(JsValue::from)?;

    serde_wasm_bindgen::to_value(&pair)
        .map_err(|e| JsValue::from_str(&e.to_string()))
}

// ---------------------------------------------------------------------------
// Wallet wrappers (Phase 4)
// ---------------------------------------------------------------------------

/// Create a new wallet from a mnemonic, network, and address type.
///
/// Derives descriptors internally, creates the BDK wallet, stores it in
/// thread-local state, and returns a `CreateWalletResult` as JsValue.
#[wasm_bindgen]
pub fn create_wallet(
    mnemonic_str: &str,
    network: &str,
    address_type: &str,
) -> Result<JsValue, JsValue> {
    let net = types::BitcoinNetwork::try_from(network).map_err(JsValue::from)?;
    let addr_type = types::AddressType::try_from(address_type).map_err(JsValue::from)?;

    let pair = descriptors::derive_descriptors(mnemonic_str, net, addr_type)
        .map_err(JsValue::from)?;

    let mut bdk_wallet = wallet::create_wallet(&pair.external, &pair.internal, net)
        .map_err(JsValue::from)?;

    let first_address = wallet::get_new_address(&mut bdk_wallet);

    let initial_changeset = bdk_wallet
        .take_staged()
        .unwrap_or_default();

    let changeset_json = wallet::serialize_changeset(&initial_changeset)
        .map_err(JsValue::from)?;

    ACTIVE_WALLET.with(|w| w.replace(Some(bdk_wallet)));
    ACCUMULATED_CHANGESET.with(|cs| *cs.borrow_mut() = initial_changeset);

    let result = types::CreateWalletResult {
        external_descriptor: pair.external,
        internal_descriptor: pair.internal,
        first_address,
        changeset_json,
    };

    serde_wasm_bindgen::to_value(&result)
        .map_err(|e| JsValue::from_str(&e.to_string()))
}

/// Load a previously persisted wallet from descriptors and a changeset JSON.
#[wasm_bindgen]
pub fn load_wallet(
    external_descriptor: &str,
    internal_descriptor: &str,
    network: &str,
    changeset_json: &str,
) -> Result<JsValue, JsValue> {
    let net = types::BitcoinNetwork::try_from(network).map_err(JsValue::from)?;
    let changeset = wallet::deserialize_changeset(changeset_json).map_err(JsValue::from)?;

    let bdk_wallet = wallet::load_wallet(external_descriptor, internal_descriptor, net, changeset)
        .map_err(JsValue::from)?;

    let restored_changeset = wallet::deserialize_changeset(changeset_json).map_err(JsValue::from)?;

    ACTIVE_WALLET.with(|w| w.replace(Some(bdk_wallet)));
    ACCUMULATED_CHANGESET.with(|cs| *cs.borrow_mut() = restored_changeset);

    Ok(JsValue::TRUE)
}

/// Reveal the next external address from the active wallet.
#[wasm_bindgen]
pub fn get_new_address() -> Result<String, JsValue> {
    let address = with_wallet_mut(|w| wallet::get_new_address(w))?;
    accumulate_staged_changes();
    Ok(address)
}

/// Return the active wallet's balance as a `BalanceInfo` JsValue.
#[wasm_bindgen]
pub fn get_balance() -> Result<JsValue, JsValue> {
    let balance = with_wallet(|w| wallet::get_balance(w))?;
    serde_wasm_bindgen::to_value(&balance)
        .map_err(|e| JsValue::from_str(&e.to_string()))
}

/// Export the full accumulated changeset as a JSON string.
///
/// This includes all changes since the wallet was created or loaded,
/// giving the frontend the complete state needed to reconstruct the wallet.
#[wasm_bindgen]
pub fn export_changeset() -> Result<String, JsValue> {
    accumulate_staged_changes();
    ACCUMULATED_CHANGESET.with(|cs| {
        wallet::serialize_changeset(&cs.borrow()).map_err(JsValue::from)
    })
}
