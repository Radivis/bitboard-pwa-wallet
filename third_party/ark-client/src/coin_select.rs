use crate::error::ErrorContext;
use crate::swap_storage::SwapStorage;
use crate::wallet::OnchainWallet;
use crate::Blockchain;
use crate::Client;
use crate::Error;
use ark_core::contract::SpendPathKind;
use ark_core::unilateral_exit;
use ark_core::ExplorerUtxo;
use bitcoin::Amount;
use bitcoin::TxOut;
use jiff::Timestamp;
use std::collections::HashSet;
use std::time::Duration;

/// Select boarding outputs and VTXOs to be used as inputs in on-chain transactions, exiting the Ark
/// ecosystem.
///
/// This function prioritizes boarding outputs over VTXOs. That is, we may not select any VTXOs if
/// the `target_amount` is covered using only boarding outputs.
///
/// TODO: We should use a coin selection algorithm that takes into account fees e.g.
/// https://github.com/bitcoindevkit/coin-select.
///
/// TODO: Part of this logic needs to be extracted into `ark-core`.
pub async fn coin_select_for_onchain<B, W, S>(
    client: &Client<B, W, S>,
    target_amount: Amount,
) -> Result<
    (
        Vec<unilateral_exit::OnChainInput>,
        Vec<unilateral_exit::VtxoInput>,
    ),
    Error,
>
where
    B: Blockchain,
    W: OnchainWallet,
    S: SwapStorage + 'static,
{
    let boarding_outputs = client.boarding_outputs()?;

    let now = Timestamp::now();

    let mut selected_boarding_outputs = HashSet::new();
    let mut selected_amount = Amount::ZERO;

    for boarding_output in boarding_outputs.iter() {
        if target_amount <= selected_amount {
            return Ok((selected_boarding_outputs.into_iter().collect(), Vec::new()));
        }

        let outpoints = client
            .blockchain()
            .find_outpoints(boarding_output.address())
            .await?;

        for o in outpoints.iter() {
            // Find outpoints for each boarding output.
            if let ExplorerUtxo {
                outpoint,
                amount,
                confirmation_blocktime: Some(confirmation_blocktime),
                confirmations,
                is_spent: false,
            } = o
            {
                // For each confirmed outpoint, check if they can already be spent unilaterally
                // using the exit path.
                if boarding_output.can_be_claimed_unilaterally_by_owner(
                    now.as_duration().try_into().context("invalid now")?,
                    Duration::from_secs(*confirmation_blocktime),
                    *confirmations,
                ) {
                    tracing::debug!(?outpoint, %amount, ?boarding_output, "Selected boarding output");

                    let script_pubkey = boarding_output.script_pubkey();
                    let spend_selection = boarding_output.spend_selection(SpendPathKind::Exit)?;

                    if selected_boarding_outputs.insert(
                        unilateral_exit::OnChainInput::new_with_spend_selection(
                            boarding_output.exit_delay(),
                            script_pubkey,
                            spend_selection,
                            *amount,
                            *outpoint,
                        ),
                    ) {
                        selected_amount += *amount;
                    }
                }
            }
        }
    }

    let mut selected_vtxo_outputs = HashSet::new();

    for contract in client.active_offchain_contracts()? {
        let vtxo = &contract.vtxo;
        if target_amount <= selected_amount {
            return Ok((
                selected_boarding_outputs.into_iter().collect(),
                selected_vtxo_outputs.into_iter().collect(),
            ));
        }

        let outpoints = client.blockchain().find_outpoints(vtxo.address()).await?;
        for o in outpoints.iter() {
            // Find outpoints for each VTXO.
            if let ExplorerUtxo {
                outpoint,
                amount,
                confirmation_blocktime: Some(confirmation_blocktime),
                confirmations,
                is_spent: false,
            } = o
            {
                // For each confirmed outpoint, check if they can already be spent unilaterally
                // using the exit path.
                if vtxo.can_be_claimed_unilaterally_by_owner(
                    now.as_duration().try_into().map_err(Error::ad_hoc)?,
                    Duration::from_secs(*confirmation_blocktime),
                    *confirmations,
                ) {
                    tracing::debug!(?outpoint, %amount, ?vtxo, "Selected VTXO");

                    let script_pubkey = vtxo.script_pubkey();
                    let spend_selection = contract.spend_selection(SpendPathKind::Exit)?;

                    selected_vtxo_outputs.insert(
                        unilateral_exit::VtxoInput::new_with_spend_selection(
                            *outpoint,
                            vtxo.exit_delay(),
                            TxOut {
                                value: *amount,
                                script_pubkey,
                            },
                            spend_selection,
                        ),
                    );
                    selected_amount += *amount;
                }
            }
        }
    }

    if selected_amount < target_amount {
        return Err(Error::coin_select(format!(
            "insufficient funds: selected = {selected_amount}, needed = {target_amount}"
        )));
    }

    Ok((
        selected_boarding_outputs.into_iter().collect(),
        selected_vtxo_outputs.into_iter().collect(),
    ))
}

use ark_core::Vtxo;
use ark_core::VtxoList;
use bitcoin::OutPoint;
use bitcoin::ScriptBuf;
use bitcoin::Txid;
use std::collections::HashMap;

/// Completion input selected without Esplora confirmation blocktime.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MissingBlocktimeCompletionInput {
    pub virtual_txid: Txid,
    pub on_chain_outpoint: OutPoint,
    pub amount_sats: u64,
}

/// Result of completion coin selection over an explicit virtual-outpoint set.
#[derive(Debug, Clone)]
pub struct VtxoCompletionSelection {
    /// Completion spends unrolled VTXOs. Boarding outputs are not selected here.
    #[allow(dead_code)]
    pub onchain_inputs: Vec<unilateral_exit::OnChainInput>,
    pub vtxo_inputs: Vec<unilateral_exit::VtxoInput>,
    pub selected_amount: Amount,
    pub missing_blocktime_inputs: Vec<MissingBlocktimeCompletionInput>,
}

#[allow(clippy::too_many_arguments)]
fn try_select_one_claimable_utxo_for_virtual_outpoint(
    vtxo: &Vtxo,
    virtual_txid: Txid,
    explorer_utxos: &[ExplorerUtxo],
    now: Timestamp,
    selected_vtxo_outputs: &mut HashSet<unilateral_exit::VtxoInput>,
    selected_amount: &mut Amount,
    missing_blocktime_inputs: &mut Vec<MissingBlocktimeCompletionInput>,
    missing_blocktime_outpoints: &mut HashSet<OutPoint>,
) -> Result<(), Error> {
    for explorer_utxo in explorer_utxos {
        let ExplorerUtxo {
            outpoint,
            amount,
            confirmation_blocktime,
            confirmations,
            is_spent: false,
        } = explorer_utxo
        else {
            continue;
        };

        let blocktime_missing = confirmation_blocktime.is_none();
        let confirmation_blocktime = confirmation_blocktime
            .map(Duration::from_secs)
            .unwrap_or(Duration::ZERO);

        if !vtxo.can_be_claimed_unilaterally_by_owner(
            now.as_duration().try_into().map_err(Error::ad_hoc)?,
            confirmation_blocktime,
            *confirmations,
        ) {
            continue;
        }

        let vtxo_input = unilateral_exit::VtxoInput::new(
            *outpoint,
            vtxo.exit_delay(),
            TxOut {
                value: *amount,
                script_pubkey: vtxo.script_pubkey(),
            },
            vtxo.exit_spend_info()?,
        );
        if !selected_vtxo_outputs.insert(vtxo_input) {
            continue;
        }

        *selected_amount += *amount;
        if blocktime_missing && missing_blocktime_outpoints.insert(*outpoint) {
            missing_blocktime_inputs.push(MissingBlocktimeCompletionInput {
                virtual_txid,
                on_chain_outpoint: *outpoint,
                amount_sats: amount.to_sat(),
            });
        }
        return Ok(());
    }
    Ok(())
}

/// Completion coin-select using a caller-provided VTXO list.
pub async fn coin_select_vtxo_outpoints_for_onchain_with_vtxo_list<B, W, S>(
    client: &Client<B, W, S>,
    vtxo_list: &VtxoList,
    script_pubkey_to_vtxo: &HashMap<ScriptBuf, Vtxo>,
    vtxo_outpoint_filter: &HashSet<OutPoint>,
) -> Result<VtxoCompletionSelection, Error>
where
    B: Blockchain,
    W: OnchainWallet,
    S: SwapStorage + 'static,
{
    if vtxo_outpoint_filter.is_empty() {
        return Err(Error::coin_select("vtxo outpoint filter must not be empty"));
    }

    let now = Timestamp::now();
    let mut selected_vtxo_outputs = HashSet::new();
    let mut selected_amount = Amount::ZERO;
    let mut missing_blocktime_inputs = Vec::new();
    let mut missing_blocktime_outpoints = HashSet::new();

    for virtual_tx_outpoint in vtxo_list
        .all()
        .filter(|vtxo| vtxo_outpoint_filter.contains(&vtxo.outpoint) && !vtxo.is_swept)
    {
        let Some(vtxo) = script_pubkey_to_vtxo.get(&virtual_tx_outpoint.script) else {
            continue;
        };
        let outpoints = client.blockchain().find_outpoints(vtxo.address()).await?;
        try_select_one_claimable_utxo_for_virtual_outpoint(
            vtxo,
            virtual_tx_outpoint.outpoint.txid,
            &outpoints,
            now,
            &mut selected_vtxo_outputs,
            &mut selected_amount,
            &mut missing_blocktime_inputs,
            &mut missing_blocktime_outpoints,
        )?;
    }

    if selected_vtxo_outputs.is_empty() {
        let listed = vtxo_list.all().count();
        let matched = vtxo_list
            .all()
            .filter(|vtxo| vtxo_outpoint_filter.contains(&vtxo.outpoint) && !vtxo.is_swept)
            .count();
        return Err(Error::coin_select(format!(
            "no matching unrolled VTXOs found for completion (listed {listed}, matched {matched}, scripts {}, filter {})",
            script_pubkey_to_vtxo.len(),
            vtxo_outpoint_filter.len(),
        )));
    }

    Ok(VtxoCompletionSelection {
        onchain_inputs: Vec::new(),
        vtxo_inputs: selected_vtxo_outputs.into_iter().collect(),
        selected_amount,
        missing_blocktime_inputs,
    })
}
