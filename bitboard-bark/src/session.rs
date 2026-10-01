use std::cell::RefCell;

use bip39::Mnemonic;
use bitcoin::Network;
use bitcoin::key::Keypair;
use wasm_bindgen::prelude::*;

use crate::history::movements_to_json;
use crate::sync_gate::BarkSessionSyncGate;
use crate::{BARK_SIGNET_ESPLORA_URL, BARK_SIGNET_SERVER_URL};

thread_local! {
    static ACTIVE_WALLET: RefCell<Option<bark::Wallet>> = const { RefCell::new(None) };
    static SESSION_SYNC_GATE: RefCell<BarkSessionSyncGate> =
        const { RefCell::new(BarkSessionSyncGate::new()) };
    static PREPARED_BOARD_FUNDING: RefCell<Option<PreparedBoardFunding>> =
        const { RefCell::new(None) };
}

/// VTXO key for one in-flight board. Never returned to JavaScript.
#[derive(Clone)]
struct PreparedBoardFunding {
    user_keypair: Keypair,
    expiry_height: u32,
    funding_address: String,
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
    clear_session_sync_gate();
    Ok(fingerprint)
}

fn clear_session_sync_gate() {
    SESSION_SYNC_GATE.with(|gate| gate.borrow_mut().clear());
}

fn mark_session_synced() {
    SESSION_SYNC_GATE.with(|gate| gate.borrow_mut().mark_synced());
}

fn require_session_synced() -> Result<(), String> {
    SESSION_SYNC_GATE.with(|gate| gate.borrow().require_synced().map_err(str::to_owned))
}

fn clear_prepared_board_funding() {
    PREPARED_BOARD_FUNDING.with(|slot| {
        if let Ok(mut prepared) = slot.try_borrow_mut() {
            prepared.take();
        }
    });
}

fn store_prepared_board_funding(prepared: PreparedBoardFunding) -> Result<(), String> {
    PREPARED_BOARD_FUNDING.with(|slot| {
        let mut current = slot
            .try_borrow_mut()
            .map_err(|_| "Bark board funding is already borrowed".to_owned())?;
        current.take();
        *current = Some(prepared);
        Ok(())
    })
}

fn copy_prepared_board_funding() -> Result<PreparedBoardFunding, String> {
    PREPARED_BOARD_FUNDING.with(|slot| {
        let prepared = slot
            .try_borrow()
            .map_err(|_| "Bark board funding is already borrowed".to_owned())?;
        prepared
            .clone()
            .ok_or_else(|| "Bark board funding is not prepared".to_owned())
    })
}

fn drop_active_wallet() -> Result<(), String> {
    ACTIVE_WALLET.with(|wallet_cell| -> Result<(), String> {
        let mut slot = wallet_cell
            .try_borrow_mut()
            .map_err(|_| "Bark session is already borrowed".to_owned())?;
        slot.take();
        Ok(())
    })?;
    clear_session_sync_gate();
    clear_prepared_board_funding();
    Ok(())
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

fn take_active_wallet() -> Result<bark::Wallet, String> {
    ACTIVE_WALLET.with(|wallet_cell| {
        let mut slot = wallet_cell
            .try_borrow_mut()
            .map_err(|_| "Bark session is already borrowed".to_owned())?;
        slot.take()
            .ok_or_else(|| "Bark session is not open".to_owned())
    })
}

fn finish_wallet_operation<T>(
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

fn bark_error(err: impl std::fmt::Display) -> String {
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

/// Funding address for a board that the on-chain wallet will pay.
/// Derives and stores the next VTXO key. The key stays in this session.
#[wasm_bindgen]
pub struct BarkPreparedBoardFunding {
    funding_address: String,
    expiry_height: u32,
}

#[wasm_bindgen]
impl BarkPreparedBoardFunding {
    #[wasm_bindgen(getter)]
    pub fn funding_address(&self) -> String {
        self.funding_address.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn expiry_height(&self) -> u32 {
        self.expiry_height
    }
}

/// Off-chain board fee. Does not include the on-chain funding fee.
#[wasm_bindgen]
pub struct BarkBoardFeeEstimate {
    gross_amount_sats: u64,
    fee_sats: u64,
    net_amount_sats: u64,
}

#[wasm_bindgen]
impl BarkBoardFeeEstimate {
    #[wasm_bindgen(getter)]
    pub fn gross_amount_sats(&self) -> u64 {
        self.gross_amount_sats
    }

    #[wasm_bindgen(getter)]
    pub fn fee_sats(&self) -> u64 {
        self.fee_sats
    }

    #[wasm_bindgen(getter)]
    pub fn net_amount_sats(&self) -> u64 {
        self.net_amount_sats
    }
}

/// A board Bark accepted. Bark broadcasts a finalized funding PSBT itself.
#[wasm_bindgen]
pub struct BarkBoardAccepted {
    funding_txid: String,
    vtxo_amount_sats: u64,
    movement_id: u32,
}

#[wasm_bindgen]
impl BarkBoardAccepted {
    #[wasm_bindgen(getter)]
    pub fn funding_txid(&self) -> String {
        self.funding_txid.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn vtxo_amount_sats(&self) -> u64 {
        self.vtxo_amount_sats
    }

    #[wasm_bindgen(getter)]
    pub fn movement_id(&self) -> u32 {
        self.movement_id
    }
}

/// Estimates the server board fee. Does not derive a VTXO key.
#[wasm_bindgen]
pub async fn bark_estimate_board_offchain_fee(
    amount_sats: u64,
) -> Result<BarkBoardFeeEstimate, JsValue> {
    let wallet = take_active_wallet().map_err(|err| JsValue::from_str(&err))?;
    let operation_result = async {
        let estimate = wallet
            .estimate_board_offchain_fee(bitcoin::Amount::from_sat(amount_sats))
            .await
            .map_err(bark_error)?;
        Ok(BarkBoardFeeEstimate {
            gross_amount_sats: estimate.gross_amount.to_sat(),
            fee_sats: estimate.fee.to_sat(),
            net_amount_sats: estimate.net_amount.to_sat(),
        })
    }
    .await;
    finish_wallet_operation(wallet, operation_result).map_err(|err| JsValue::from_str(&err))
}

/// Stores the next VTXO key and returns the board funding address.
/// A second call replaces the in-memory key. The previous key stays unused in IndexedDB.
#[wasm_bindgen]
pub async fn bark_prepare_board_funding() -> Result<BarkPreparedBoardFunding, JsValue> {
    let wallet = take_active_wallet().map_err(|err| JsValue::from_str(&err))?;
    let operation_result = async {
        let (user_keypair, _key_index) = wallet
            .derive_store_next_keypair()
            .await
            .map_err(bark_error)?;
        let (funding_address, expiry_height) = wallet
            .board_funding_address(&user_keypair)
            .await
            .map_err(bark_error)?;
        Ok(PreparedBoardFunding {
            user_keypair,
            expiry_height,
            funding_address: funding_address.to_string(),
        })
    }
    .await;
    let prepared =
        finish_wallet_operation(wallet, operation_result).map_err(|err| JsValue::from_str(&err))?;
    let funding_address = prepared.funding_address.clone();
    let expiry_height = prepared.expiry_height;
    store_prepared_board_funding(prepared).map_err(|err| JsValue::from_str(&err))?;
    Ok(BarkPreparedBoardFunding {
        funding_address,
        expiry_height,
    })
}

/// Cosigns a funding PSBT that pays the prepared board address.
/// A finalized PSBT is broadcast by Bark. The prepared key is kept when this fails.
#[wasm_bindgen]
pub async fn bark_board_psbt(psbt_base64: String) -> Result<BarkBoardAccepted, JsValue> {
    let prepared = copy_prepared_board_funding().map_err(|err| JsValue::from_str(&err))?;
    let wallet = take_active_wallet().map_err(|err| JsValue::from_str(&err))?;
    let operation_result = async {
        let board_psbt = psbt_base64
            .parse::<bitcoin::Psbt>()
            .map_err(|err: bitcoin::psbt::PsbtParseError| err.to_string())?;
        let pending = wallet
            .board_psbt(board_psbt, prepared.user_keypair, prepared.expiry_height)
            .await
            .map_err(bark_error)?;
        Ok(BarkBoardAccepted {
            funding_txid: pending.funding_tx.compute_txid().to_string(),
            vtxo_amount_sats: pending.amount.to_sat(),
            movement_id: pending.movement_id.0,
        })
    }
    .await;
    let accepted =
        finish_wallet_operation(wallet, operation_result).map_err(|err| JsValue::from_str(&err))?;
    clear_prepared_board_funding();
    Ok(accepted)
}

/// Local fund movements, newest first. Does not require a sync in this session.
#[wasm_bindgen]
pub async fn bark_history() -> Result<String, JsValue> {
    let wallet = take_active_wallet().map_err(|err| JsValue::from_str(&err))?;
    let operation_result = async {
        let movements = wallet.history().await.map_err(bark_error)?;
        movements_to_json(&movements)
    }
    .await;
    finish_wallet_operation(wallet, operation_result).map_err(|err| JsValue::from_str(&err))
}
