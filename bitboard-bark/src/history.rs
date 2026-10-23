use serde::Serialize;
use wasm_bindgen::prelude::*;

use crate::session::{bark_error, finish_wallet_operation, take_active_wallet};

/// One `Wallet::history` row for the activity list.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct BarkMovementRow {
    id: u32,
    status: &'static str,
    subsystem_name: String,
    subsystem_kind: String,
    effective_balance_sats: i64,
    offchain_fee_sats: u64,
    created_at_unix_seconds: i64,
}

pub fn movements_to_json(movements: &[bark::movement::Movement]) -> Result<String, String> {
    let rows = movements
        .iter()
        .map(movement_row)
        .collect::<Vec<BarkMovementRow>>();
    serde_json::to_string(&rows).map_err(|err| err.to_string())
}

fn movement_row(movement: &bark::movement::Movement) -> BarkMovementRow {
    BarkMovementRow {
        id: movement.id.0,
        status: movement.status.as_str(),
        subsystem_name: movement.subsystem.name.clone(),
        subsystem_kind: movement.subsystem.kind.clone(),
        effective_balance_sats: movement.effective_balance.to_sat(),
        offchain_fee_sats: movement.offchain_fee.to_sat(),
        created_at_unix_seconds: movement.time.created_at.timestamp(),
    }
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
