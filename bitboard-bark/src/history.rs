use serde::Serialize;

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
