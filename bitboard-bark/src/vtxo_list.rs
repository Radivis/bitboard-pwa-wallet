use serde::Serialize;

/// One local Bark VTXO, without the genesis chain.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ListedBarkVtxo {
    pub id: String,
    pub amount_sats: u64,
    pub expiry_height: u32,
    pub state: ListedBarkVtxoState,
    pub registered: bool,
}

/// Bark's wallet-local VTXO state. Spent is a forfeit. Exited is a unilateral exit.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ListedBarkVtxoState {
    Spendable,
    Locked {
        holder: Option<ListedBarkVtxoLockHolder>,
    },
    Spent,
    Exited,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ListedBarkVtxoLockHolder {
    Action { id: String },
    Movement { id: String },
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct BarkVtxoLockHolderJson {
    kind: &'static str,
    id: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct BarkVtxoRowJson {
    id: String,
    amount_sats: u64,
    expiry_height: u32,
    state: &'static str,
    lock_holder: Option<BarkVtxoLockHolderJson>,
    registered: bool,
}

#[cfg(test)]
pub fn listed_vtxos_to_json(vtxos: &[ListedBarkVtxo]) -> Result<String, String> {
    let rows = vtxos.iter().map(row_json).collect::<Vec<_>>();
    serde_json::to_string(&rows).map_err(|err| err.to_string())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct BarkVtxoListJson {
    tip_height: Option<u32>,
    vtxos: Vec<BarkVtxoRowJson>,
}

/// Rows plus the chain tip used to turn an expiry height into blocks remaining.
pub fn vtxo_list_response_json(
    tip_height: Option<u32>,
    vtxos: &[ListedBarkVtxo],
) -> Result<String, String> {
    let payload = BarkVtxoListJson {
        tip_height,
        vtxos: vtxos.iter().map(row_json).collect(),
    };
    serde_json::to_string(&payload).map_err(|err| err.to_string())
}

fn row_json(vtxo: &ListedBarkVtxo) -> BarkVtxoRowJson {
    let (state, lock_holder) = state_json(&vtxo.state);
    BarkVtxoRowJson {
        id: vtxo.id.clone(),
        amount_sats: vtxo.amount_sats,
        expiry_height: vtxo.expiry_height,
        state,
        lock_holder,
        registered: vtxo.registered,
    }
}

fn state_json(state: &ListedBarkVtxoState) -> (&'static str, Option<BarkVtxoLockHolderJson>) {
    match state {
        ListedBarkVtxoState::Spendable => ("spendable", None),
        ListedBarkVtxoState::Spent => ("spent", None),
        ListedBarkVtxoState::Exited => ("exited", None),
        ListedBarkVtxoState::Locked { holder } => ("locked", holder.as_ref().map(holder_json)),
    }
}

fn holder_json(holder: &ListedBarkVtxoLockHolder) -> BarkVtxoLockHolderJson {
    match holder {
        ListedBarkVtxoLockHolder::Action { id } => BarkVtxoLockHolderJson {
            kind: "action",
            id: id.clone(),
        },
        ListedBarkVtxoLockHolder::Movement { id } => BarkVtxoLockHolderJson {
            kind: "movement",
            id: id.clone(),
        },
    }
}

#[cfg(target_arch = "wasm32")]
pub fn listed_bark_vtxo_from_wallet(vtxo: &bark::WalletVtxo) -> ListedBarkVtxo {
    ListedBarkVtxo {
        id: vtxo.id().to_string(),
        amount_sats: vtxo.amount().to_sat(),
        expiry_height: vtxo.expiry_height(),
        state: listed_state(&vtxo.state),
        registered: vtxo.registered,
    }
}

#[cfg(target_arch = "wasm32")]
fn listed_state(state: &bark::vtxo::VtxoState) -> ListedBarkVtxoState {
    match state {
        bark::vtxo::VtxoState::Spendable => ListedBarkVtxoState::Spendable,
        bark::vtxo::VtxoState::Spent => ListedBarkVtxoState::Spent,
        bark::vtxo::VtxoState::Exited => ListedBarkVtxoState::Exited,
        bark::vtxo::VtxoState::Locked { holder } => ListedBarkVtxoState::Locked {
            holder: holder.as_ref().map(listed_holder),
        },
    }
}

#[cfg(target_arch = "wasm32")]
fn listed_holder(holder: &bark::vtxo::VtxoLockHolder) -> ListedBarkVtxoLockHolder {
    match holder {
        bark::vtxo::VtxoLockHolder::Action { id } => {
            ListedBarkVtxoLockHolder::Action { id: id.clone() }
        }
        bark::vtxo::VtxoLockHolder::Movement { id } => {
            ListedBarkVtxoLockHolder::Movement { id: id.to_string() }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{
        ListedBarkVtxo, ListedBarkVtxoLockHolder, ListedBarkVtxoState, listed_vtxos_to_json,
        vtxo_list_response_json,
    };

    #[test]
    fn vtxo_state_json_covers_each_bark_state() {
        let rows = [
            listed("spend:0", 1_000, 100, ListedBarkVtxoState::Spendable, false),
            listed(
                "action:1",
                2_000,
                110,
                ListedBarkVtxoState::Locked {
                    holder: Some(ListedBarkVtxoLockHolder::Action {
                        id: "pay-1".to_owned(),
                    }),
                },
                true,
            ),
            listed(
                "movement:2",
                3_000,
                120,
                ListedBarkVtxoState::Locked {
                    holder: Some(ListedBarkVtxoLockHolder::Movement { id: "4".to_owned() }),
                },
                false,
            ),
            listed(
                "unlocked-holder:3",
                4_000,
                130,
                ListedBarkVtxoState::Locked { holder: None },
                false,
            ),
            listed("spent:4", 5_000, 140, ListedBarkVtxoState::Spent, false),
            listed("exited:5", 6_000, 150, ListedBarkVtxoState::Exited, true),
        ];

        let json = listed_vtxos_to_json(&rows).expect("json");
        let value: serde_json::Value = serde_json::from_str(&json).expect("parse");

        assert_eq!(value[0]["id"], "spend:0");
        assert_eq!(value[0]["amountSats"], 1_000);
        assert_eq!(value[0]["expiryHeight"], 100);
        assert_eq!(value[0]["state"], "spendable");
        assert!(value[0]["lockHolder"].is_null());
        assert_eq!(value[0]["registered"], false);

        assert_eq!(value[1]["state"], "locked");
        assert_eq!(value[1]["lockHolder"]["kind"], "action");
        assert_eq!(value[1]["lockHolder"]["id"], "pay-1");
        assert_eq!(value[1]["registered"], true);

        assert_eq!(value[2]["state"], "locked");
        assert_eq!(value[2]["lockHolder"]["kind"], "movement");
        assert_eq!(value[2]["lockHolder"]["id"], "4");

        assert_eq!(value[3]["state"], "locked");
        assert!(value[3]["lockHolder"].is_null());

        assert_eq!(value[4]["state"], "spent");
        assert!(value[4]["lockHolder"].is_null());

        assert_eq!(value[5]["state"], "exited");
        assert_eq!(value[5]["registered"], true);
        assert!(value[5]["lockHolder"].is_null());
    }

    #[test]
    fn vtxo_list_response_includes_the_chain_tip() {
        let json = vtxo_list_response_json(
            Some(80),
            &[listed(
                "spend:0",
                1_000,
                100,
                ListedBarkVtxoState::Spendable,
                false,
            )],
        )
        .expect("json");
        let value: serde_json::Value = serde_json::from_str(&json).expect("parse");

        assert_eq!(value["tipHeight"], 80);
        assert_eq!(value["vtxos"][0]["expiryHeight"], 100);
    }

    #[test]
    fn vtxo_list_response_keeps_rows_when_the_tip_is_unknown() {
        let json = vtxo_list_response_json(None, &[]).expect("json");
        let value: serde_json::Value = serde_json::from_str(&json).expect("parse");

        assert!(value["tipHeight"].is_null());
        assert!(value["vtxos"].as_array().expect("rows").is_empty());
    }

    fn listed(
        id: &str,
        amount_sats: u64,
        expiry_height: u32,
        state: ListedBarkVtxoState,
        registered: bool,
    ) -> ListedBarkVtxo {
        ListedBarkVtxo {
            id: id.to_owned(),
            amount_sats,
            expiry_height,
            state,
            registered,
        }
    }
}

#[cfg(target_arch = "wasm32")]
mod wasm_export {
    use wasm_bindgen::prelude::*;

    use super::{listed_bark_vtxo_from_wallet, vtxo_list_response_json};
    use crate::session::{bark_error, finish_wallet_operation, take_active_wallet};

    /// Local VTXOs, including spent and exited. Does not require a sync in this session.
    #[wasm_bindgen]
    pub async fn bark_list_vtxos() -> Result<String, JsValue> {
        let wallet = take_active_wallet().map_err(|err| JsValue::from_str(&err))?;
        let operation_result = async {
            let vtxos = wallet.all_vtxos().await.map_err(bark_error)?;
            let listed = vtxos
                .iter()
                .map(listed_bark_vtxo_from_wallet)
                .collect::<Vec<_>>();
            let tip_height = wallet.chain().tip().await.ok();
            vtxo_list_response_json(tip_height, &listed)
        }
        .await;
        finish_wallet_operation(wallet, operation_result).map_err(|err| JsValue::from_str(&err))
    }
}
