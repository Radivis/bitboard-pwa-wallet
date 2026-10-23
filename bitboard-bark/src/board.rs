//! In-flight board funding and the board WASM exports.

use std::cell::RefCell;

use bitcoin::key::Keypair;
use wasm_bindgen::prelude::*;

use crate::session::{bark_error, finish_wallet_operation, take_active_wallet};

thread_local! {
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

pub(crate) fn clear_prepared_board_funding() {
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

/// Off-chain board fee. Collaborative-exit quotes reuse this shape.
#[wasm_bindgen]
pub struct BarkBoardFeeEstimate {
    gross_amount_sats: u64,
    fee_sats: u64,
    net_amount_sats: u64,
}

impl BarkBoardFeeEstimate {
    pub(crate) fn from_parts(gross_amount_sats: u64, fee_sats: u64, net_amount_sats: u64) -> Self {
        Self {
            gross_amount_sats,
            fee_sats,
            net_amount_sats,
        }
    }
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
        Ok(BarkBoardFeeEstimate::from_parts(
            estimate.gross_amount.to_sat(),
            estimate.fee.to_sat(),
            estimate.net_amount.to_sat(),
        ))
    }
    .await;
    finish_wallet_operation(wallet, operation_result).map_err(|err| JsValue::from_str(&err))
}

/// Stores the next VTXO key and returns the board funding address.
/// A second call replaces the in-memory key. The previous key stays unused in the record store.
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
