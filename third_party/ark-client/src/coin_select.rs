use crate::error::ErrorContext;
use crate::swap_storage::SwapStorage;
use crate::wallet::BoardingWallet;
use crate::wallet::OnchainWallet;
use crate::Blockchain;
use crate::Client;
use crate::Error;
use ark_core::unilateral_exit;
use ark_core::ExplorerUtxo;
use bitcoin::Amount;
use bitcoin::OutPoint;
use bitcoin::TxOut;
use bitcoin::Txid;
use jiff::Timestamp;
use std::collections::HashSet;
use std::time::Duration;

/// Completion input selected without Esplora `confirmation_blocktime` (timelock estimated with zero).
///
/// Populated only on the completion coin-select path when Esplora omits blocktime — see
/// `coin_select_vtxo_txids_for_onchain` vendor-patch docs (regtest / thin indexers).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MissingBlocktimeCompletionInput {
    pub virtual_txid: Txid,
    pub on_chain_outpoint: OutPoint,
    pub amount_sats: u64,
}

/// Result of [`coin_select_vtxo_txids_for_onchain`].
#[derive(Debug, Clone)]
pub struct VtxoCompletionSelection {
    pub onchain_inputs: Vec<unilateral_exit::OnChainInput>,
    pub vtxo_inputs: Vec<unilateral_exit::VtxoInput>,
    pub selected_amount: Amount,
    pub missing_blocktime_inputs: Vec<MissingBlocktimeCompletionInput>,
}

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
pub async fn coin_select_for_onchain<B, W, S, K>(
    client: &Client<B, W, S, K>,
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
    W: BoardingWallet + OnchainWallet,
    S: SwapStorage + 'static,
    K: crate::KeyProvider,
{
    let boarding_outputs = client.inner.wallet.get_boarding_outputs()?;

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

                    if selected_boarding_outputs.insert(unilateral_exit::OnChainInput::new(
                        boarding_output.clone(),
                        *amount,
                        *outpoint,
                    )) {
                        selected_amount += *amount;
                    }
                }
            }
        }
    }

    let mut selected_vtxo_outputs = HashSet::new();

    for (_, vtxo) in client.get_offchain_addresses()? {
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

                    selected_vtxo_outputs.insert(unilateral_exit::VtxoInput::new(
                        *outpoint,
                        vtxo.exit_delay(),
                        TxOut {
                            value: *amount,
                            script_pubkey: vtxo.script_pubkey(),
                        },
                        vtxo.exit_spend_info()?,
                    ));
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

/// Select claimable on-chain VTXO inputs whose virtual or on-chain txid appears in `vtxo_txid_filter`.
///
/// Boarding outputs are excluded so completion only spends the requested unrolled VTXOs.
///
/// # Bitboard vendor patch (fork drift)
///
/// Vendored from [ark-client 0.9.3](https://github.com/arkade-os/rust-sdk/tree/master/crates/ark-client).
/// This function diverges from upstream `coin_select.rs`; track changes here and contribute back when possible:
///
/// - **VTXO iteration:** upstream uses `vtxo_list.all_unspent()`; Bitboard uses `vtxo_list.all()`
///   filtered by `vtxo_txid_filter` (see inline comment below). After unilateral unroll, arkd marks
///   VTXOs `is_spent`/`is_unrolled`, so `all_unspent()` drops them even though they still fund the exit PSBT.
/// - **`confirmation_blocktime`:** upstream requires a known blocktime and skips the UTXO when
///   Esplora omits it. Bitboard completion coin-select is **intentionally permissive**: it uses
///   `unwrap_or(Duration::ZERO)` so regtest and other thin Esplora stacks (arkade-regtest mempool
///   Esplora often lacks `block_time` on address/tx status) can still exercise unilateral-exit
///   completion in CI and local debugging without failing coin-select. Production Esplora usually
///   supplies blocktime (and `bitboard-ark` backfills from `/tx/status` when the address listing
///   omits it); missing blocktime is uncommon on mainnet-class networks. Affected inputs are
///   recorded in [`VtxoCompletionSelection::missing_blocktime_inputs`] and surfaced in the UI so
///   timelock eligibility is known to be estimated conservatively, not proven.
/// - **Diagnostics:** Bitboard adds `tracing::debug!` logging per candidate VTXO.
///
/// Upstream contribution target: <https://github.com/arkade-os/rust-sdk> (`ark-client/src/coin_select.rs`).
/// Bitboard context: <https://github.com/Radivis/bitboard-pwa-wallet/pull/50> (signer rotation / REG-04).
pub async fn coin_select_vtxo_txids_for_onchain<B, W, S, K>(
    client: &Client<B, W, S, K>,
    vtxo_txid_filter: &HashSet<Txid>,
) -> Result<VtxoCompletionSelection, Error>
where
    B: Blockchain,
    W: BoardingWallet + OnchainWallet,
    S: SwapStorage + 'static,
    K: crate::KeyProvider,
{
    if vtxo_txid_filter.is_empty() {
        return Err(Error::coin_select("vtxo txid filter must not be empty"));
    }

    let (vtxo_list, script_pubkey_to_vtxo) = client.list_vtxos().await?;
    let now = Timestamp::now();
    let mut selected_vtxo_outputs = HashSet::new();
    let mut selected_amount = Amount::ZERO;
    let mut missing_blocktime_inputs = Vec::new();
    let mut missing_blocktime_outpoints = HashSet::new();

    // Completion targets explicit virtual txids. After unroll, arkd's indexer often marks those
    // VTXOs `is_spent` and/or `is_unrolled`, which moves them into `VtxoList::spent()` — they are
    // no longer returned by `all_unspent()`. Search the full list for filter matches instead.
    for virtual_tx_outpoint in vtxo_list
        .all()
        .filter(|vtp| vtxo_txid_filter.contains(&vtp.outpoint.txid) && !vtp.is_swept)
    {
        let Some(vtxo) = script_pubkey_to_vtxo.get(&virtual_tx_outpoint.script) else {
            tracing::debug!(
                txid = %virtual_tx_outpoint.outpoint.txid,
                "completion coin-select: missing spend info for VTXO script"
            );
            continue;
        };

        let outpoints = client.blockchain().find_outpoints(vtxo.address()).await?;
        let matches_virtual_txid = vtxo_txid_filter.contains(&virtual_tx_outpoint.outpoint.txid);
        let matches_onchain_txid = outpoints.iter().any(|explorer_utxo| {
            matches!(
                explorer_utxo,
                ExplorerUtxo { outpoint, .. } if vtxo_txid_filter.contains(&outpoint.txid)
            )
        });

        tracing::debug!(
            txid = %virtual_tx_outpoint.outpoint.txid,
            vout = virtual_tx_outpoint.outpoint.vout,
            is_unrolled = virtual_tx_outpoint.is_unrolled,
            is_spent = virtual_tx_outpoint.is_spent,
            outpoint_count = outpoints.len(),
            matches_virtual_txid,
            matches_onchain_txid,
            "completion coin-select: candidate VTXO"
        );

        if !matches_virtual_txid && !matches_onchain_txid {
            continue;
        }

        for explorer_utxo in outpoints.iter() {
            if let ExplorerUtxo {
                outpoint,
                amount,
                confirmation_blocktime,
                confirmations,
                is_spent: false,
            } = explorer_utxo
            {
                let include_outpoint = matches_virtual_txid
                    || vtxo_txid_filter.contains(&outpoint.txid);
                if !include_outpoint {
                    continue;
                }

                // Permissive vs upstream: allow missing blocktime for regtest/thin Esplora (see module docs).
                let blocktime_missing = confirmation_blocktime.is_none();
                let confirmation_blocktime = confirmation_blocktime
                    .map(Duration::from_secs)
                    .unwrap_or(Duration::ZERO);

                if vtxo.can_be_claimed_unilaterally_by_owner(
                    now.as_duration().try_into().map_err(Error::ad_hoc)?,
                    confirmation_blocktime,
                    *confirmations,
                ) && selected_vtxo_outputs.insert(unilateral_exit::VtxoInput::new(
                    *outpoint,
                    vtxo.exit_delay(),
                    TxOut {
                        value: *amount,
                        script_pubkey: vtxo.script_pubkey(),
                    },
                    vtxo.exit_spend_info()?,
                )) {
                    selected_amount += *amount;
                    if blocktime_missing
                        && missing_blocktime_outpoints.insert(*outpoint)
                    {
                        missing_blocktime_inputs.push(MissingBlocktimeCompletionInput {
                            virtual_txid: virtual_tx_outpoint.outpoint.txid,
                            on_chain_outpoint: *outpoint,
                            amount_sats: amount.to_sat(),
                        });
                    }
                } else {
                    tracing::debug!(
                        ?outpoint,
                        confirmations,
                        ?confirmation_blocktime,
                        exit_delay = ?vtxo.exit_delay(),
                        "completion coin-select: outpoint not yet claimable"
                    );
                }
            }
        }
    }

    if selected_vtxo_outputs.is_empty() {
        return Err(Error::coin_select(
            "no matching unrolled VTXOs found for completion",
        ));
    }

    Ok(VtxoCompletionSelection {
        onchain_inputs: Vec::new(),
        vtxo_inputs: selected_vtxo_outputs.into_iter().collect(),
        selected_amount,
        missing_blocktime_inputs,
    })
}

#[cfg(test)]
mod completion_vtxo_list_tests {
    use ark_core::VtxoList;
    use ark_core::server::VirtualTxOutPoint;
    use bitcoin::{Amount, OutPoint, ScriptBuf, Txid};

    fn virtual_vtxo(txid_byte: u8, is_spent: bool, is_unrolled: bool) -> VirtualTxOutPoint {
        VirtualTxOutPoint {
            outpoint: OutPoint {
                txid: Txid::from_byte_array([txid_byte; 32]),
                vout: 0,
            },
            created_at: 0,
            expires_at: i64::MAX,
            amount: Amount::from_sat(100_000),
            script: ScriptBuf::new(),
            is_preconfirmed: false,
            is_swept: false,
            is_unrolled,
            is_spent,
            spent_by: None,
            commitment_txids: Vec::new(),
            settled_by: None,
            ark_txid: None,
            assets: Vec::new(),
        }
    }

    #[test]
    fn spent_or_unrolled_vtxos_are_excluded_from_all_unspent_but_in_all() {
        let vtxo = virtual_vtxo(0xab, true, false);
        let list = VtxoList::new(Amount::from_sat(546), vec![vtxo.clone()]);

        assert_eq!(list.all_unspent().count(), 0);
        assert_eq!(list.all().count(), 1);
        assert_eq!(list.all().next().unwrap().outpoint, vtxo.outpoint);
    }
}
