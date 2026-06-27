use std::str::FromStr;
use std::time::Duration;

use ark_core::BoardingOutput;
use ark_core::ExplorerUtxo;
use ark_core::history::Transaction;
use ark_core::server::VirtualTxOutPoint;
use bitcoin::{Address, Network, OutPoint, PublicKey, Txid};

use crate::api_types::ExitCandidateRow;
use crate::api_types::{IntentFeeConfiguredDto, PaymentRowDto};
use crate::constants::{
    DEFAULT_TX_FEE_RATE, PAYMENT_DIRECTION_INCOMING, PAYMENT_DIRECTION_OUTGOING,
    VTXO_STATUS_PRECONFIRMED, VTXO_STATUS_RECOVERABLE, VTXO_STATUS_SETTLED, VTXO_STATUS_SPENT,
    VTXO_STATUS_UNROLLED,
};
use crate::error::{ArkResult, ArkWasmError};

pub(crate) fn warn_offchain_key_discovery_failed(error: &ark_client::Error) {
    let message = format!("Arkade offchain key discovery failed: {error}");
    #[cfg(target_arch = "wasm32")]
    web_sys::console::warn_1(&message.into());
    #[cfg(not(target_arch = "wasm32"))]
    eprintln!("{message}");
}

pub(crate) fn parse_delegator_public_key(value: &str) -> ArkResult<PublicKey> {
    value
        .parse::<PublicKey>()
        .map_err(|error| ArkWasmError::InvalidDelegatorPubkey(error.to_string()))
}

pub(crate) fn parse_onchain_address(value: &str, network: Network) -> ArkResult<Address> {
    Address::from_str(value)
        .map_err(|error| ArkWasmError::InvalidOnchainAddress(error.to_string()))?
        .require_network(network)
        .map_err(|error| ArkWasmError::InvalidOnchainAddress(error.to_string()))
}

pub(crate) fn parse_outpoint(txid: &str, vout: u32) -> ArkResult<OutPoint> {
    let txid =
        Txid::from_str(txid).map_err(|error| ArkWasmError::InvalidTxid(error.to_string()))?;
    Ok(OutPoint { txid, vout })
}

pub(crate) fn payment_direction_and_amount_sats(signed_amount_sats: i64) -> (&'static str, u64) {
    if signed_amount_sats >= 0 {
        (PAYMENT_DIRECTION_INCOMING, signed_amount_sats as u64)
    } else {
        (
            PAYMENT_DIRECTION_OUTGOING,
            signed_amount_sats.unsigned_abs(),
        )
    }
}

pub(crate) fn map_intent_fee_configured(
    intent_fee: &ark_core::server::IntentFeeInfo,
) -> IntentFeeConfiguredDto {
    IntentFeeConfiguredDto {
        offchain_input: intent_fee
            .offchain_input
            .as_ref()
            .is_some_and(|v| !v.is_empty()),
        onchain_input: intent_fee
            .onchain_input
            .as_ref()
            .is_some_and(|v| !v.is_empty()),
        offchain_output: intent_fee
            .offchain_output
            .as_ref()
            .is_some_and(|v| !v.is_empty()),
        onchain_output: intent_fee
            .onchain_output
            .as_ref()
            .is_some_and(|v| !v.is_empty()),
    }
}

pub(crate) fn map_history_row(transaction: Transaction) -> Option<PaymentRowDto> {
    let timestamp = transaction.created_at().unwrap_or(0);
    match transaction {
        Transaction::Boarding { txid, amount, .. } => Some(PaymentRowDto {
            direction: PAYMENT_DIRECTION_INCOMING.to_string(),
            amount_sats: amount.to_sat(),
            timestamp,
            txid: txid.to_string(),
            memo: None,
        }),
        Transaction::Commitment {
            txid,
            amount,
            created_at,
        } => {
            let (direction, amount_sats) = payment_direction_and_amount_sats(amount.to_sat());
            Some(PaymentRowDto {
                direction: direction.to_string(),
                amount_sats,
                timestamp: created_at,
                txid: txid.to_string(),
                memo: None,
            })
        }
        Transaction::Ark {
            txid,
            amount,
            created_at,
            ..
        } => {
            let (direction, amount_sats) = payment_direction_and_amount_sats(amount.to_sat());
            Some(PaymentRowDto {
                direction: direction.to_string(),
                amount_sats,
                timestamp: created_at,
                txid: txid.to_string(),
                memo: None,
            })
        }
        Transaction::Offboard {
            commitment_txid,
            amount,
            confirmed_at,
        } => Some(PaymentRowDto {
            direction: PAYMENT_DIRECTION_OUTGOING.to_string(),
            amount_sats: amount.to_sat(),
            timestamp: confirmed_at.unwrap_or(0),
            txid: commitment_txid.to_string(),
            memo: None,
        }),
    }
}

pub(crate) fn map_exit_candidate(
    virtual_tx_outpoint: &VirtualTxOutPoint,
    dust: bitcoin::Amount,
) -> ExitCandidateRow {
    let recoverable = virtual_tx_outpoint.is_recoverable(dust);
    let state = if virtual_tx_outpoint.is_spent {
        VTXO_STATUS_SPENT
    } else if virtual_tx_outpoint.is_unrolled {
        VTXO_STATUS_UNROLLED
    } else if virtual_tx_outpoint.is_preconfirmed {
        VTXO_STATUS_PRECONFIRMED
    } else if recoverable {
        VTXO_STATUS_RECOVERABLE
    } else {
        VTXO_STATUS_SETTLED
    }
    .to_string();

    ExitCandidateRow {
        id: format!(
            "{}:{}",
            virtual_tx_outpoint.outpoint.txid, virtual_tx_outpoint.outpoint.vout
        ),
        txid: virtual_tx_outpoint.outpoint.txid.to_string(),
        vout: virtual_tx_outpoint.outpoint.vout,
        amount_sats: virtual_tx_outpoint.amount.to_sat(),
        virtual_status_state: state,
        is_recoverable: recoverable,
        is_unrolled: virtual_tx_outpoint.is_unrolled,
        can_start_unroll: !recoverable
            && !virtual_tx_outpoint.is_unrolled
            && !virtual_tx_outpoint.is_spent
            && !virtual_tx_outpoint.is_swept,
        can_complete: virtual_tx_outpoint.is_unrolled && !virtual_tx_outpoint.is_spent,
    }
}

pub(crate) fn empty_fee_info() -> ark_core::server::FeeInfo {
    ark_core::server::FeeInfo {
        intent_fee: ark_core::server::IntentFeeInfo::default(),
        tx_fee_rate: DEFAULT_TX_FEE_RATE.to_string(),
    }
}

pub(crate) fn wasm_safe_now() -> Duration {
    Duration::from_secs(current_unix_timestamp().max(0) as u64)
}

pub(crate) fn accumulate_boarding_utxo_balance(
    utxo: &ExplorerUtxo,
    boarding_output: &BoardingOutput,
    now: Duration,
    spendable_sats: &mut u64,
    pending_sats: &mut u64,
    expired_sats: &mut u64,
) {
    let amount_sats = utxo.amount.to_sat();
    match *utxo {
        ExplorerUtxo {
            confirmation_blocktime: Some(confirmation_blocktime),
            confirmations,
            is_spent: false,
            ..
        } if confirmations >= 1 => {
            if boarding_output.can_be_claimed_unilaterally_by_owner(
                now,
                Duration::from_secs(confirmation_blocktime),
                confirmations,
            ) {
                *expired_sats += amount_sats;
            } else {
                *spendable_sats += amount_sats;
            }
        }
        ExplorerUtxo {
            is_spent: false, ..
        } => {
            *pending_sats += amount_sats;
        }
        _ => {}
    }
}

pub(crate) fn validate_send_amount_sats(amount_sats: u64) -> ArkResult<()> {
    if amount_sats == 0 {
        return Err(ArkWasmError::InvalidSendAmount);
    }
    Ok(())
}

pub(crate) fn current_unix_timestamp() -> i64 {
    #[cfg(target_arch = "wasm32")]
    {
        (js_sys::Date::now() / 1000.0) as i64
    }
    #[cfg(not(target_arch = "wasm32"))]
    {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("system clock before UNIX epoch")
            .as_secs() as i64
    }
}
