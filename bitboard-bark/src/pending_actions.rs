//! Pending Bark actions and the locked portion of the balance.
//!
//! A collaborative exit parks as an offboard checkpoint. Those VTXOs stay
//! locked until the action confirms or Bark fails it. The UI reads this list
//! instead of treating the checkpoint id as the explanation.

use serde::Serialize;

pub const BARK_EXIT_PARKED_STATUS: &str =
    "This exit is still in progress. Sync Bark to continue it.";
pub const BARK_EXIT_AWAITING_CONFIRMATION_STATUS: &str =
    "Waiting for the exit transaction to confirm.";

const ARKOOR_IN_PROGRESS_STATUS: &str = "This send is still in progress. Sync Bark to continue it.";
const LIGHTNING_IN_PROGRESS_STATUS: &str =
    "This Lightning send is still in progress. Sync Bark to continue it.";
const BOARD_IN_PROGRESS_STATUS: &str =
    "This boarding is still in progress. Sync Bark to continue it.";

/// How a VTXO contributes to the balance the dashboard shows.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum BarkVtxoBalanceClass {
    Spendable,
    Locked,
    Ignored,
}

/// Spendable and locked are separate sums. Spent and exited coins are ignored.
pub fn sum_spendable_and_locked_sats(vtxos: &[(BarkVtxoBalanceClass, u64)]) -> (u64, u64) {
    let mut spendable_sats = 0u64;
    let mut locked_sats = 0u64;
    for (class, amount_sats) in vtxos {
        match class {
            BarkVtxoBalanceClass::Spendable => spendable_sats += *amount_sats,
            BarkVtxoBalanceClass::Locked => locked_sats += *amount_sats,
            BarkVtxoBalanceClass::Ignored => {}
        }
    }
    (spendable_sats, locked_sats)
}

/// Before a txid exists, sync still has to drive the exit. After broadcast, it waits.
pub fn offboard_progress_status(confirmation_txid: Option<&str>) -> &'static str {
    if confirmation_txid.is_some() {
        BARK_EXIT_AWAITING_CONFIRMATION_STATUS
    } else {
        BARK_EXIT_PARKED_STATUS
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PendingBarkAction {
    pub id: String,
    pub kind: &'static str,
    pub title: &'static str,
    pub status: &'static str,
    pub amount_sats: u64,
    pub fee_sats: Option<u64>,
    pub destination: Option<String>,
    pub txid: Option<String>,
}

impl PendingBarkAction {
    pub fn offboard(
        id: impl Into<String>,
        destination: impl Into<String>,
        onchain_amount_sats: u64,
        fee_sats: u64,
        confirmation_txid: Option<String>,
    ) -> Self {
        let txid = confirmation_txid.filter(|value| !value.is_empty());
        Self {
            id: id.into(),
            kind: "offboard",
            title: "Bark exit",
            status: offboard_progress_status(txid.as_deref()),
            amount_sats: onchain_amount_sats,
            fee_sats: Some(fee_sats),
            destination: Some(destination.into()),
            txid,
        }
    }

    pub fn arkoor_send(
        id: impl Into<String>,
        destination: impl Into<String>,
        amount_sats: u64,
    ) -> Self {
        Self {
            id: id.into(),
            kind: "arkoor",
            title: "Bark send",
            status: ARKOOR_IN_PROGRESS_STATUS,
            amount_sats,
            fee_sats: None,
            destination: Some(destination.into()),
            txid: None,
        }
    }

    pub fn lightning_send(
        id: impl Into<String>,
        destination: impl Into<String>,
        amount_sats: u64,
    ) -> Self {
        Self {
            id: id.into(),
            kind: "lightning",
            title: "Bark Lightning send",
            status: LIGHTNING_IN_PROGRESS_STATUS,
            amount_sats,
            fee_sats: None,
            destination: Some(destination.into()),
            txid: None,
        }
    }

    pub fn board(id: impl Into<String>, amount_sats: u64) -> Self {
        Self {
            id: id.into(),
            kind: "board",
            title: "Bark boarding",
            status: BOARD_IN_PROGRESS_STATUS,
            amount_sats,
            fee_sats: None,
            destination: None,
            txid: None,
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PendingBarkActionJson<'a> {
    id: &'a str,
    kind: &'a str,
    title: &'a str,
    status: &'a str,
    amount_sats: u64,
    fee_sats: Option<u64>,
    destination: Option<&'a str>,
    txid: Option<&'a str>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct BarkBalanceJson {
    spendable_sats: u64,
    locked_sats: u64,
}

pub fn bark_balance_json(spendable_sats: u64, locked_sats: u64) -> Result<String, String> {
    serde_json::to_string(&BarkBalanceJson {
        spendable_sats,
        locked_sats,
    })
    .map_err(|err| err.to_string())
}

pub fn pending_actions_to_json(actions: &[PendingBarkAction]) -> Result<String, String> {
    let rows = actions
        .iter()
        .map(|action| PendingBarkActionJson {
            id: &action.id,
            kind: action.kind,
            title: action.title,
            status: action.status,
            amount_sats: action.amount_sats,
            fee_sats: action.fee_sats,
            destination: action.destination.as_deref(),
            txid: action.txid.as_deref(),
        })
        .collect::<Vec<_>>();
    serde_json::to_string(&rows).map_err(|err| err.to_string())
}

#[cfg(target_arch = "wasm32")]
mod wasm_export {
    use wasm_bindgen::prelude::*;

    use super::{
        BarkVtxoBalanceClass, PendingBarkAction, bark_balance_json, pending_actions_to_json,
        sum_spendable_and_locked_sats,
    };
    use crate::session::{bark_error, finish_wallet_operation, take_active_wallet};

    pub async fn read_session_balance_json(wallet: &bark::Wallet) -> Result<String, String> {
        let vtxos = wallet.all_vtxos().await.map_err(bark_error)?;
        let classified = vtxos
            .iter()
            .map(|vtxo| (balance_class(vtxo), vtxo.amount().to_sat()))
            .collect::<Vec<_>>();
        let (spendable_sats, locked_sats) = sum_spendable_and_locked_sats(&classified);
        bark_balance_json(spendable_sats, locked_sats)
    }

    fn balance_class(vtxo: &bark::WalletVtxo) -> BarkVtxoBalanceClass {
        match vtxo.state.kind() {
            bark::vtxo::VtxoStateKind::Spendable => BarkVtxoBalanceClass::Spendable,
            bark::vtxo::VtxoStateKind::Locked => BarkVtxoBalanceClass::Locked,
            _ => BarkVtxoBalanceClass::Ignored,
        }
    }

    fn offboard_action(offboard: &bark::actions::offboard::Offboard) -> PendingBarkAction {
        PendingBarkAction::offboard(
            offboard.id.clone(),
            offboard.destination.clone().assume_checked().to_string(),
            offboard.onchain_output_amount.to_sat(),
            offboard.committed_fee.to_sat(),
            offboard_confirmation_txid(&offboard.progress),
        )
    }

    fn offboard_confirmation_txid(progress: &bark::actions::offboard::Progress) -> Option<String> {
        match progress {
            bark::actions::offboard::Progress::AwaitingConfirmations { offboard_txid, .. } => {
                Some(offboard_txid.to_string())
            }
            _ => None,
        }
    }

    fn arkoor_action(send: &bark::actions::arkoor_send::ArkoorSend) -> PendingBarkAction {
        PendingBarkAction::arkoor_send(
            send.id(),
            send.destination.to_string(),
            send.amount.to_sat(),
        )
    }

    fn lightning_action(send: &bark::actions::lightning::pay::LightningSend) -> PendingBarkAction {
        PendingBarkAction::lightning_send(
            send.id(),
            send.invoice.to_string(),
            send.payment_amount.to_sat(),
        )
    }

    fn board_action(board: &bark::persist::models::PendingBoard) -> PendingBarkAction {
        PendingBarkAction::board(board.movement_id.to_string(), board.amount.to_sat())
    }

    /// In-flight offboards, arkoor sends, Lightning sends, and boards.
    /// Does not require a sync in this session.
    #[wasm_bindgen]
    pub async fn bark_pending_actions() -> Result<String, JsValue> {
        let wallet = take_active_wallet().map_err(|err| JsValue::from_str(&err))?;
        let operation_result = async {
            let mut actions = Vec::new();
            for offboard in wallet.pending_offboards().await.map_err(bark_error)? {
                actions.push(offboard_action(&offboard));
            }
            for send in wallet.pending_arkoor_sends().await.map_err(bark_error)? {
                actions.push(arkoor_action(&send));
            }
            for send in wallet.pending_lightning_sends().await.map_err(bark_error)? {
                actions.push(lightning_action(&send));
            }
            for board in wallet.pending_boards().await.map_err(bark_error)? {
                actions.push(board_action(&board));
            }
            pending_actions_to_json(&actions)
        }
        .await;
        finish_wallet_operation(wallet, operation_result).map_err(|err| JsValue::from_str(&err))
    }
}

#[cfg(target_arch = "wasm32")]
pub use wasm_export::read_session_balance_json;

#[cfg(test)]
mod tests {
    use super::{
        BARK_EXIT_AWAITING_CONFIRMATION_STATUS, BARK_EXIT_PARKED_STATUS, BarkVtxoBalanceClass,
        PendingBarkAction, bark_balance_json, pending_actions_to_json,
        sum_spendable_and_locked_sats,
    };

    #[test]
    fn locked_sats_are_the_sum_of_locked_vtxos_and_stay_separate_from_spendable() {
        let (spendable_sats, locked_sats) = sum_spendable_and_locked_sats(&[
            (BarkVtxoBalanceClass::Spendable, 1_000),
            (BarkVtxoBalanceClass::Locked, 400),
            (BarkVtxoBalanceClass::Locked, 50),
            (BarkVtxoBalanceClass::Ignored, 9_000),
        ]);

        assert_eq!(spendable_sats, 1_000);
        assert_eq!(locked_sats, 450);

        let json = bark_balance_json(spendable_sats, locked_sats).expect("json");
        let value: serde_json::Value = serde_json::from_str(&json).expect("parse");
        assert_eq!(value["spendableSats"], 1_000);
        assert_eq!(value["lockedSats"], 450);
    }

    #[test]
    fn pending_offboard_json_includes_destination_amount_and_a_stable_progress_label() {
        let actions = [
            PendingBarkAction::offboard(
                "20fb503685add1f2fe5af4056979dc98",
                "tb1qcurrent",
                10_000,
                50_815,
                None,
            ),
            PendingBarkAction::offboard(
                "aabbccddeeff00112233445566778899",
                "tb1qconfirmed",
                20_000,
                100,
                Some("deadbeef".to_owned()),
            ),
        ];

        let json = pending_actions_to_json(&actions).expect("json");
        let value: serde_json::Value = serde_json::from_str(&json).expect("parse");

        assert_eq!(value[0]["kind"], "offboard");
        assert_eq!(value[0]["id"], "20fb503685add1f2fe5af4056979dc98");
        assert_eq!(value[0]["destination"], "tb1qcurrent");
        assert_eq!(value[0]["amountSats"], 10_000);
        assert_eq!(value[0]["feeSats"], 50_815);
        assert_eq!(value[0]["status"], BARK_EXIT_PARKED_STATUS);
        assert!(value[0]["txid"].is_null());

        assert_eq!(value[1]["destination"], "tb1qconfirmed");
        assert_eq!(value[1]["amountSats"], 20_000);
        assert_eq!(value[1]["status"], BARK_EXIT_AWAITING_CONFIRMATION_STATUS);
        assert_eq!(value[1]["txid"], "deadbeef");
    }

    #[test]
    fn pending_sibling_actions_keep_kind_amount_and_destination() {
        let actions = [
            PendingBarkAction::arkoor_send("ark-1", "tark1example", 4_000),
            PendingBarkAction::lightning_send("ln-1", "lnbc1example", 2_500),
            PendingBarkAction::board("7", 8_000),
        ];

        let json = pending_actions_to_json(&actions).expect("json");
        let value: serde_json::Value = serde_json::from_str(&json).expect("parse");

        assert_eq!(value[0]["kind"], "arkoor");
        assert_eq!(value[0]["amountSats"], 4_000);
        assert_eq!(value[0]["destination"], "tark1example");
        assert_eq!(value[1]["kind"], "lightning");
        assert_eq!(value[1]["amountSats"], 2_500);
        assert_eq!(value[1]["destination"], "lnbc1example");
        assert_eq!(value[2]["kind"], "board");
        assert_eq!(value[2]["id"], "7");
        assert_eq!(value[2]["amountSats"], 8_000);
        assert!(value[2]["destination"].is_null());
    }
}
