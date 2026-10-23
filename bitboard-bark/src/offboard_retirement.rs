// Callers live in the wasm session and the regtest harness. Native unit tests
// compile this module without those callers.
#![cfg_attr(not(target_arch = "wasm32"), allow(dead_code))]

//! Server already spent an offboard input. Record that locally and drop the checkpoint.

use crate::exit_address::{ExitInputState, spent_vtxo_ids_named_by_server};

fn bark_error(err: impl std::fmt::Display) -> String {
    format!("{err:#}")
}

fn exit_input_is_already_consumed(vtxo: &bark::WalletVtxo) -> bool {
    matches!(
        exit_input_state(vtxo),
        ExitInputState::Spent | ExitInputState::Exited
    )
}

fn exit_input_state(vtxo: &bark::WalletVtxo) -> ExitInputState {
    match vtxo.state.kind() {
        bark::vtxo::VtxoStateKind::Spendable => ExitInputState::Spendable,
        bark::vtxo::VtxoStateKind::Locked => ExitInputState::Locked,
        bark::vtxo::VtxoStateKind::Spent => ExitInputState::Spent,
        bark::vtxo::VtxoStateKind::Exited => ExitInputState::Exited,
    }
}

fn offboard_input_ids(offboard: &bark::actions::offboard::Offboard) -> Vec<String> {
    let ids = match &offboard.kind {
        bark::actions::offboard::OffboardKind::OffboardWhole { input_vtxo_ids }
        | bark::actions::offboard::OffboardKind::SendOnchain { input_vtxo_ids, .. } => {
            input_vtxo_ids
        }
    };
    ids.iter().map(ToString::to_string).collect()
}

/// The server already spent this input. Record that locally and drop the checkpoint
/// so the next exit's spendable selection cannot submit it again.
pub(crate) async fn retire_offboard_if_server_spent_an_input(
    wallet: &bark::Wallet,
    error_message: &str,
) -> Result<bool, String> {
    let spent_ids = spent_vtxo_ids_named_by_server(error_message);
    if spent_ids.is_empty() {
        return Ok(false);
    }
    record_named_vtxos_as_spent(wallet, &spent_ids).await?;
    stop_offboards_that_name(wallet, &spent_ids).await?;
    Ok(true)
}

/// `SendOnchain` marks its original inputs spent when the arkoor split commits.
/// That spend is this checkpoint, not a reason to cancel it.
pub(crate) fn send_onchain_split_already_spent_its_inputs(
    kind: &bark::actions::offboard::OffboardKind,
    progress: &bark::actions::offboard::Progress,
) -> bool {
    let send_onchain = matches!(
        kind,
        bark::actions::offboard::OffboardKind::SendOnchain { .. }
    );
    let split_is_committed = !matches!(
        progress,
        bark::actions::offboard::Progress::Start
            | bark::actions::offboard::Progress::SplitWithArkoor
    );
    send_onchain && split_is_committed
}

/// A checkpoint whose input is already spent or exited must not be driven again.
pub(crate) async fn stop_offboard_whose_inputs_are_already_consumed(
    wallet: &bark::Wallet,
    offboard: &bark::actions::offboard::Offboard,
) -> Result<bool, String> {
    if send_onchain_split_already_spent_its_inputs(&offboard.kind, &offboard.progress) {
        return Ok(false);
    }
    let input_ids = offboard_input_ids(offboard);
    let vtxos = wallet.all_vtxos().await.map_err(bark_error)?;
    let consumed = input_ids.iter().any(|input_id| {
        vtxos
            .iter()
            .any(|vtxo| vtxo.id().to_string() == *input_id && exit_input_is_already_consumed(vtxo))
    });
    if !consumed {
        return Ok(false);
    }
    wallet
        .stop_wallet_action(&offboard.id)
        .await
        .map_err(bark_error)?;
    Ok(true)
}

async fn record_named_vtxos_as_spent(
    wallet: &bark::Wallet,
    spent_ids: &[String],
) -> Result<(), String> {
    let vtxos = wallet.all_vtxos().await.map_err(bark_error)?;
    let matched = vtxos
        .into_iter()
        .filter(|vtxo| {
            spent_ids
                .iter()
                .any(|spent_id| spent_id == &vtxo.id().to_string())
        })
        .collect::<Vec<_>>();
    if matched.is_empty() {
        return Ok(());
    }
    wallet
        .mark_vtxos_as_spent(&matched)
        .await
        .map_err(bark_error)
}

async fn stop_offboards_that_name(
    wallet: &bark::Wallet,
    spent_ids: &[String],
) -> Result<(), String> {
    let pending = wallet.pending_offboards().await.map_err(bark_error)?;
    for offboard in pending {
        let names_spent_input = offboard_input_ids(&offboard)
            .iter()
            .any(|input_id| spent_ids.iter().any(|spent_id| spent_id == input_id));
        if names_spent_input {
            wallet
                .stop_wallet_action(&offboard.id)
                .await
                .map_err(bark_error)?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use bark::actions::offboard::{OffboardKind, Progress};

    use super::send_onchain_split_already_spent_its_inputs;

    fn send_onchain() -> OffboardKind {
        OffboardKind::SendOnchain {
            input_vtxo_ids: Vec::new(),
            arkoor_key_index: 0,
            change_key_index: 1,
            change_pieces: None,
        }
    }

    #[test]
    fn a_send_onchain_split_is_not_an_external_spend() {
        let kind = send_onchain();
        assert!(!send_onchain_split_already_spent_its_inputs(
            &kind,
            &Progress::Start,
        ));
        assert!(!send_onchain_split_already_spent_its_inputs(
            &kind,
            &Progress::SplitWithArkoor,
        ));
        assert!(send_onchain_split_already_spent_its_inputs(
            &kind,
            &Progress::ArkoorRegistrationRequired {
                offboard_vtxo_ids: Vec::new(),
                change_vtxo_ids: Vec::new(),
            },
        ));
        assert!(send_onchain_split_already_spent_its_inputs(
            &kind,
            &Progress::ReadyForOffboard {
                offboard_vtxo_ids: Vec::new(),
                prior_txid: None,
            },
        ));
    }

    #[test]
    fn an_offboard_of_whole_vtxos_still_stops_when_those_inputs_are_spent() {
        let kind = OffboardKind::OffboardWhole {
            input_vtxo_ids: Vec::new(),
        };
        assert!(!send_onchain_split_already_spent_its_inputs(
            &kind,
            &Progress::ReadyForOffboard {
                offboard_vtxo_ids: Vec::new(),
                prior_txid: None,
            },
        ));
    }
}
