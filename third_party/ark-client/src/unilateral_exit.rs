use crate::coin_select::coin_select_for_onchain;
use crate::coin_select::coin_select_vtxo_outpoints_for_onchain;
use crate::coin_select::coin_select_vtxo_outpoints_for_onchain_with_vtxo_list;
use crate::error::Error;
use crate::error::ErrorContext;
use crate::swap_storage::SwapStorage;
use crate::utils::sleep;
use crate::utils::timeout_op;
use crate::wallet::BoardingWallet;
use crate::wallet::OnchainWallet;
use crate::Blockchain;
use crate::Client;
use ark_core::build_unilateral_exit_tree_txids;
use ark_core::script::extract_checksig_pubkeys;
use ark_core::unilateral_exit;
use ark_core::unilateral_exit::create_unilateral_exit_transaction;
use ark_core::unilateral_exit::finalize_unilateral_exit_tree;
use ark_core::unilateral_exit::UnilateralExitTree;
use backon::ExponentialBuilder;
use backon::Retryable;
use bitcoin::key::Secp256k1;
use bitcoin::psbt;
use ark_core::server::VirtualTxOutPoint;
use ark_core::server::VtxoChains;
use ark_core::Vtxo;
use ark_core::VtxoList;
use bitcoin::Address;
use bitcoin::Amount;
use bitcoin::OutPoint;
use bitcoin::Psbt;
use bitcoin::ScriptBuf;
use bitcoin::Transaction;
use bitcoin::TxOut;
use bitcoin::Txid;
use std::collections::HashMap;
use std::collections::HashSet;

/// Max iterations when targeting completion tx fee from measured vsize.
const UNILATERAL_COMPLETION_FEE_MAX_ITERATIONS: u8 = 20;

/// Minimum relay fee used as the initial guess before measuring vsize.
const UNILATERAL_COMPLETION_FEE_INITIAL_SAT: u64 = 1_000;

// # Bitboard vendor patch (fork drift)
//
// `resolve_unilateral_completion_fee_and_amount_from_inputs`, `estimate_send_on_chain_for_vtxo_outpoints`,
// and dynamic fee targeting in `send_on_chain_for_vtxo_outpoints` / `create_send_on_chain_transaction_inner`
// replace the upstream hardcoded 1_000 sat completion fee with build-and-measure targeting via Esplora fee rate.

/// arkd's indexer rejects any request that does not carry an explicit, positive `page.size`
/// (`InvalidArgument: invalid page size`), so every chain / virtual-tx query must send a real page
/// size and then follow the page cursor to collect all results. 100 mirrors the page size
/// `list_vtxos` already uses.
const INDEXER_PAGE_SIZE: i32 = 100;

/// arkd broadcasts the round commitment before the Esplora index lists `/tx/{txid}`; poll briefly
/// so a freshly confirmed settlement is not mistaken for a missing commitment during unroll.
const COMMITMENT_TX_VISIBILITY_MAX_POLLS: u8 = 20;
const COMMITMENT_TX_VISIBILITY_POLL_DELAY_MS: u64 = 500;

// TODO: We should not _need_ to connect to the Ark server to perform unilateral exit. Currently we
// do talk to the Ark server for simplicity.
impl<B, W, S, K> Client<B, W, S, K>
where
    B: Blockchain,
    W: BoardingWallet + OnchainWallet,
    S: SwapStorage + 'static,
    K: crate::KeyProvider,
{
    /// Fetch VTXO chain topology and virtual PSBTs needed for autonomous unilateral exit.
    pub async fn prefetch_unilateral_exit_materials(
        &self,
        outpoint: OutPoint,
    ) -> Result<(VtxoChains, Vec<Psbt>), Error> {
        let chains = self.fetch_full_vtxo_chain(outpoint).await?;
        let paths = build_unilateral_exit_tree_txids(&chains, outpoint.txid)?;
        let txids = HashSet::<Txid>::from_iter(paths.concat());
        let virtual_txs = self
            .fetch_all_virtual_txs(txids.iter().map(|txid| txid.to_string()).collect())
            .await?;
        Ok((chains, virtual_txs))
    }

    /// Build the finalized on-chain unroll branch using prefetched materials (no ASP calls).
    pub async fn build_unilateral_exit_branch_from_materials(
        &self,
        target: OutPoint,
        virtual_tx_outpoint: &VirtualTxOutPoint,
        vtxo_chains: VtxoChains,
        virtual_psbts: Vec<Psbt>,
    ) -> Result<Vec<Transaction>, Error> {
        let paths =
            build_unilateral_exit_tree_txids(&vtxo_chains, virtual_tx_outpoint.outpoint.txid)?;

        let paths = paths
            .into_iter()
            .map(|path| {
                path.into_iter()
                    .map(|txid| {
                        virtual_psbts
                            .iter()
                            .find(|psbt| psbt.unsigned_tx.compute_txid() == txid)
                            .cloned()
                            .ok_or_else(|| {
                                Error::ad_hoc(format!("no PSBT found for virtual TX {txid}"))
                            })
                    })
                    .collect::<Result<Vec<_>, _>>()
            })
            .collect::<Result<Vec<_>, _>>()?;

        let unilateral_exit_tree = UnilateralExitTree::new(
            virtual_tx_outpoint.commitment_txids.clone(),
            paths,
        );

        let branches = self
            .finalize_unilateral_exit_tree_on_chain(&unilateral_exit_tree)
            .await?;

        branches
            .into_iter()
            .find(|branch| {
                branch
                    .last()
                    .is_some_and(|tx| tx.compute_txid() == target.txid)
            })
            .ok_or_else(|| {
                Error::ad_hoc(format!("No unilateral exit branch found for VTXO {target}"))
            })
    }

    /// Build the finalized on-chain unroll branch for one VTXO.
    pub async fn build_unilateral_exit_branch(
        &self,
        target: OutPoint,
    ) -> Result<Vec<Transaction>, Error> {
        let (vtxo_list, _) = self
            .list_vtxos()
            .await
            .context("failed to get spendable VTXOs")?;

        let Some(virtual_tx_outpoint) = vtxo_list
            .could_exit_unilaterally()
            .find(|vtp| vtp.outpoint == target)
        else {
            return Err(Error::ad_hoc(format!(
                "VTXO {target} is not eligible for unilateral exit"
            )));
        };

        let unilateral_exit_tree = self
            .unilateral_exit_tree_for_outpoint(virtual_tx_outpoint)
            .await?;
        let branches = self
            .finalize_unilateral_exit_tree_on_chain(&unilateral_exit_tree)
            .await?;

        branches
            .into_iter()
            .find(|branch| {
                branch
                    .last()
                    .is_some_and(|tx| tx.compute_txid() == target.txid)
            })
            .ok_or_else(|| {
                Error::ad_hoc(format!("No unilateral exit branch found for VTXO {target}"))
            })
    }

    /// Build the unilateral exit transaction tree for all spendable VTXOs.
    ///
    /// ### Returns
    ///
    /// The tree as a `Vec<Vec<Transaction>>`, where each branch represents a path from a
    /// commitment transaction output to a spendable VTXO. Every transaction is finalized, but
    /// requires fee bumping through a P2A output.
    pub async fn build_unilateral_exit_trees(&self) -> Result<Vec<Vec<Transaction>>, Error> {
        let (vtxo_list, _) = self
            .list_vtxos()
            .await
            .context("failed to get spendable VTXOs")?;

        let mut unilateral_exit_trees = Vec::new();

        // For each spendable VTXO, generate its unilateral exit tree.
        for virtual_tx_outpoint in vtxo_list.could_exit_unilaterally() {
            let unilateral_exit_tree = self
                .unilateral_exit_tree_for_outpoint(virtual_tx_outpoint)
                .await?;
            unilateral_exit_trees.push(unilateral_exit_tree);
        }

        let mut branches: Vec<Vec<Transaction>> = Vec::new();
        for unilateral_exit_tree in unilateral_exit_trees {
            let commitment_txids = unilateral_exit_tree.commitment_txids();

            let mut commitment_txs = Vec::new();
            for commitment_txid in commitment_txids.iter() {
                commitment_txs.push(self.find_commitment_tx_on_chain(commitment_txid).await?);
            }

            let finalized_unilateral_exit_tree =
                finalize_unilateral_exit_tree(&unilateral_exit_tree, commitment_txs.as_slice())?;
            branches.extend(finalized_unilateral_exit_tree);
        }

        Ok(branches)
    }

    async fn unilateral_exit_tree_for_outpoint(
        &self,
        virtual_tx_outpoint: &VirtualTxOutPoint,
    ) -> Result<UnilateralExitTree, Error> {
        let vtxo_chains = self
            .fetch_full_vtxo_chain(virtual_tx_outpoint.outpoint)
            .await?;

        let paths =
            build_unilateral_exit_tree_txids(&vtxo_chains, virtual_tx_outpoint.outpoint.txid)?;

        // We don't want to fetch transactions more than once.
        let txids = HashSet::<Txid>::from_iter(paths.concat());

        let virtual_txs = self
            .fetch_all_virtual_txs(txids.iter().map(|txid| txid.to_string()).collect())
            .await?;

        let paths = paths
            .into_iter()
            .map(|path| {
                path.into_iter()
                    .map(|txid| {
                        virtual_txs
                            .iter()
                            .find(|t| t.unsigned_tx.compute_txid() == txid)
                            .cloned()
                            .ok_or_else(|| {
                                Error::ad_hoc(format!("no PSBT found for virtual TX {txid}"))
                            })
                    })
                    .collect::<Result<Vec<_>, _>>()
            })
            .collect::<Result<Vec<_>, _>>()?;

        Ok(UnilateralExitTree::new(
            virtual_tx_outpoint.commitment_txids.clone(),
            paths,
        ))
    }

    /// Fetch the complete VTXO chain for `outpoint` (paginated by [`Client::get_vtxo_chain`]).
    async fn fetch_full_vtxo_chain(&self, outpoint: OutPoint) -> Result<VtxoChains, Error> {
        Ok(self
            .get_vtxo_chain(outpoint)
            .await?
            .map(|response| response.chains)
            .unwrap_or(VtxoChains { inner: Vec::new() }))
    }

    /// Fetch every virtual TX in `txids`, following arkd's page cursor across pages.
    async fn fetch_all_virtual_txs(&self, txids: Vec<String>) -> Result<Vec<Psbt>, Error> {
        let mut virtual_txs = Vec::new();
        let mut page_index = 0;

        loop {
            let response = timeout_op(
                self.inner.timeout,
                self.network_client()
                    .get_virtual_txs(txids.clone(), Some((INDEXER_PAGE_SIZE, page_index))),
            )
            .await
            .context("failed to get virtual TXs")??;

            virtual_txs.extend(response.txs);

            match response.page {
                Some(page) if page.next < page.total => page_index = page.next,
                _ => break,
            }
        }

        Ok(virtual_txs)
    }

    async fn find_commitment_tx_on_chain(
        &self,
        commitment_txid: &Txid,
    ) -> Result<Transaction, Error> {
        for attempt in 0..COMMITMENT_TX_VISIBILITY_MAX_POLLS {
            if let Some(commitment_tx) = timeout_op(
                self.inner.timeout,
                self.blockchain().find_tx(commitment_txid),
            )
            .await??
            {
                return Ok(commitment_tx);
            }
            if attempt + 1 < COMMITMENT_TX_VISIBILITY_MAX_POLLS {
                sleep(std::time::Duration::from_millis(
                    COMMITMENT_TX_VISIBILITY_POLL_DELAY_MS,
                ))
                .await;
            }
        }
        Err(Error::ad_hoc(format!(
            "could not find commitment TX {commitment_txid}"
        )))
    }

    async fn finalize_unilateral_exit_tree_on_chain(
        &self,
        unilateral_exit_tree: &UnilateralExitTree,
    ) -> Result<Vec<Vec<Transaction>>, Error> {
        let commitment_txids = unilateral_exit_tree.commitment_txids();

        let mut commitment_txs = Vec::new();
        for commitment_txid in commitment_txids.iter() {
            commitment_txs.push(self.find_commitment_tx_on_chain(commitment_txid).await?);
        }

        Ok(finalize_unilateral_exit_tree(
            unilateral_exit_tree,
            commitment_txs.as_slice(),
        )?)
    }

    /// Broadcast the next unconfirmed transaction in a branch, skipping transactions that are
    /// already on the blockchain.
    ///
    /// ### Returns
    ///
    /// `Ok(Some(txid))` if a transaction was broadcast, `Ok(None)` if all are confirmed.
    pub async fn broadcast_next_unilateral_exit_node(
        &self,
        branch: &[Transaction],
    ) -> Result<Option<Txid>, Error> {
        let blockchain = &self.blockchain();

        for parent_tx in branch {
            let parent_txid = parent_tx.compute_txid();

            let broadcast = || async {
                let is_not_published = blockchain.find_tx(&parent_txid).await?.is_none();

                if is_not_published {
                    let child_tx = self.bump_tx(parent_tx).await?;
                    let bump_txid = child_tx.compute_txid();

                    tracing::info!(
                        txid = %parent_txid,
                        %bump_txid,
                        "Broadcasting unilateral exit TX"
                    );

                    blockchain
                        .broadcast_package(&[parent_tx, &child_tx])
                        .await?;

                    Ok(Some(parent_txid))
                } else {
                    tracing::debug!(
                        %parent_txid,
                        "Unilateral exit TX already found on the blockchain"
                    );

                    Ok(None)
                }
            };

            let res = broadcast
                .retry(ExponentialBuilder::default().with_max_times(5))
                .sleep(sleep)
                .notify(|err: &Error, dur: std::time::Duration| {
                    tracing::warn!(
                        "Retrying broadcasting VTXO transaction {parent_txid} after {dur:?}. Error: {err}",
                    );
                })
                .await
                .with_context(|| format!("Failed to broadcast VTXO transaction {parent_txid}"))?;

            if let Some(bump_txid) = res {
                tracing::info!(
                    txid = %parent_txid,
                    %bump_txid,
                    "Broadcast VTXO transaction"
                );

                return Ok(Some(parent_txid));
            }
        }

        // All transactions in the branch are already on-chain
        Ok(None)
    }

    /// Spend boarding outputs and VTXOs to an _on-chain_ address.
    ///
    /// All these outputs are spent unilaterally.
    ///
    /// To be able to spend a boarding output, we must wait for the exit delay to pass.
    ///
    /// To be able to spend a VTXO, the VTXO itself must be published on-chain (via something like
    /// `unilateral_off_board`), and then we must wait for the exit delay to pass.
    pub async fn send_on_chain(
        &self,
        to_address: Address,
        to_amount: Amount,
    ) -> Result<Txid, Error> {
        let (tx, _) = self
            .create_send_on_chain_transaction_inner(to_address, to_amount)
            .await?;

        let txid = tx.compute_txid();
        tracing::info!(
            %txid,
            "Broadcasting transaction sending Ark outputs onchain"
        );

        timeout_op(self.inner.timeout, self.blockchain().broadcast(&tx))
            .await
            .with_context(|| format!("failed to broadcast transaction {txid}"))??;

        Ok(txid)
    }

    /// Spend selected unrolled VTXOs using a caller-provided VTXO list (autonomous mode).
    pub async fn send_on_chain_for_vtxo_outpoints_with_vtxo_list(
        &self,
        to_address: Address,
        vtxo_outpoints: &[OutPoint],
        vtxo_list: &VtxoList,
        script_pubkey_to_vtxo: &HashMap<ScriptBuf, Vtxo>,
        fee_rate_sat_per_vb: Option<f64>,
    ) -> Result<Txid, Error> {
        let vtxo_outpoint_filter: HashSet<OutPoint> = vtxo_outpoints.iter().copied().collect();
        let selection = coin_select_vtxo_outpoints_for_onchain_with_vtxo_list(
            self,
            vtxo_list,
            script_pubkey_to_vtxo,
            &vtxo_outpoint_filter,
        )
        .await?;
        let vtxo_inputs = selection.vtxo_inputs;
        let selected_amount = selection.selected_amount;

        let (fee, to_amount) = self
            .resolve_unilateral_completion_fee_and_amount_from_inputs(
                to_address.clone(),
                Vec::new(),
                vtxo_inputs.clone(),
                selected_amount,
                fee_rate_sat_per_vb,
            )
            .await?;

        let (tx, _) = self
            .create_send_on_chain_transaction_from_inputs(
                to_address,
                to_amount,
                Vec::new(),
                vtxo_inputs,
            )
            .await?;

        let txid = tx.compute_txid();
        tracing::info!(
            %txid,
            fee = %fee,
            "Broadcasting selective unilateral exit completion transaction (offline vtxo list)"
        );

        timeout_op(self.inner.timeout, self.blockchain().broadcast(&tx))
            .await
            .with_context(|| format!("failed to broadcast transaction {txid}"))??;

        Ok(txid)
    }

    /// Spend selected unrolled VTXOs to an on-chain address.
    pub async fn send_on_chain_for_vtxo_outpoints(
        &self,
        to_address: Address,
        vtxo_outpoints: &[OutPoint],
        fee_rate_sat_per_vb: Option<f64>,
    ) -> Result<Txid, Error> {
        let vtxo_outpoint_filter: HashSet<OutPoint> = vtxo_outpoints.iter().copied().collect();
        let selection =
            coin_select_vtxo_outpoints_for_onchain(self, &vtxo_outpoint_filter).await?;
        let vtxo_inputs = selection.vtxo_inputs;
        let selected_amount = selection.selected_amount;

        let (fee, to_amount) = self
            .resolve_unilateral_completion_fee_and_amount_from_inputs(
                to_address.clone(),
                Vec::new(),
                vtxo_inputs.clone(),
                selected_amount,
                fee_rate_sat_per_vb,
            )
            .await?;

        let (tx, _) = self
            .create_send_on_chain_transaction_from_inputs(
                to_address,
                to_amount,
                Vec::new(),
                vtxo_inputs,
            )
            .await?;

        let txid = tx.compute_txid();
        tracing::info!(
            %txid,
            fee = %fee,
            "Broadcasting selective unilateral exit completion transaction"
        );

        timeout_op(self.inner.timeout, self.blockchain().broadcast(&tx))
            .await
            .with_context(|| format!("failed to broadcast transaction {txid}"))??;

        Ok(txid)
    }

    /// Estimate completion using a caller-provided VTXO list (autonomous mode).
    pub async fn estimate_send_on_chain_for_vtxo_outpoints_with_vtxo_list(
        &self,
        to_address: Address,
        vtxo_outpoints: &[OutPoint],
        vtxo_list: &VtxoList,
        script_pubkey_to_vtxo: &HashMap<ScriptBuf, Vtxo>,
        fee_rate_sat_per_vb: Option<f64>,
    ) -> Result<(Amount, Amount, Amount, Vec<crate::coin_select::MissingBlocktimeCompletionInput>), Error> {
        let vtxo_outpoint_filter: HashSet<OutPoint> = vtxo_outpoints.iter().copied().collect();
        let selection = coin_select_vtxo_outpoints_for_onchain_with_vtxo_list(
            self,
            vtxo_list,
            script_pubkey_to_vtxo,
            &vtxo_outpoint_filter,
        )
        .await?;
        let vtxo_inputs = selection.vtxo_inputs;
        let selected_amount = selection.selected_amount;
        let missing_blocktime_inputs = selection.missing_blocktime_inputs;
        let (fee, to_amount) = self
            .resolve_unilateral_completion_fee_and_amount_from_inputs(
                to_address,
                Vec::new(),
                vtxo_inputs,
                selected_amount,
                fee_rate_sat_per_vb,
            )
            .await?;
        Ok((fee, to_amount, selected_amount, missing_blocktime_inputs))
    }

    /// Estimate miner fee and receive amount for completing unilateral exit without broadcasting.
    pub async fn estimate_send_on_chain_for_vtxo_outpoints(
        &self,
        to_address: Address,
        vtxo_outpoints: &[OutPoint],
        fee_rate_sat_per_vb: Option<f64>,
    ) -> Result<(Amount, Amount, Amount, Vec<crate::coin_select::MissingBlocktimeCompletionInput>), Error> {
        let vtxo_outpoint_filter: HashSet<OutPoint> = vtxo_outpoints.iter().copied().collect();
        let selection =
            coin_select_vtxo_outpoints_for_onchain(self, &vtxo_outpoint_filter).await?;
        let vtxo_inputs = selection.vtxo_inputs;
        let selected_amount = selection.selected_amount;
        let missing_blocktime_inputs = selection.missing_blocktime_inputs;
        let (fee, to_amount) = self
            .resolve_unilateral_completion_fee_and_amount_from_inputs(
                to_address,
                Vec::new(),
                vtxo_inputs,
                selected_amount,
                fee_rate_sat_per_vb,
            )
            .await?;
        Ok((fee, to_amount, selected_amount, missing_blocktime_inputs))
    }

    /// Build the on-chain send transaction without broadcasting.
    ///
    /// Primarily useful for testing. Exposed publicly behind the `test-utils` feature.
    #[cfg(feature = "test-utils")]
    pub async fn create_send_on_chain_transaction(
        &self,
        to_address: Address,
        to_amount: Amount,
    ) -> Result<(Transaction, Vec<TxOut>), Error> {
        self.create_send_on_chain_transaction_inner(to_address, to_amount)
            .await
    }

    pub(crate) async fn create_send_on_chain_transaction_inner(
        &self,
        to_address: Address,
        to_amount: Amount,
    ) -> Result<(Transaction, Vec<TxOut>), Error> {
        let dust = self.server_info()?.dust;
        if to_amount < dust {
            return Err(Error::ad_hoc(format!(
                "invalid amount {to_amount}, must be greater than dust: {}",
                dust,
            )));
        }

        let mut fee = Amount::from_sat(UNILATERAL_COMPLETION_FEE_INITIAL_SAT);
        for _ in 0..UNILATERAL_COMPLETION_FEE_MAX_ITERATIONS {
            let (onchain_inputs, vtxo_inputs) =
                coin_select_for_onchain(self, to_amount + fee).await?;
            let selected_amount = onchain_inputs
                .iter()
                .map(|input| input.previous_output().value)
                .chain(
                    vtxo_inputs
                        .iter()
                        .map(|input| input.previous_output().value),
                )
                .fold(Amount::ZERO, |accumulator, amount| accumulator + amount);

            let (resolved_fee, resolved_to_amount) = self
                .resolve_unilateral_completion_fee_and_amount_from_inputs(
                    to_address.clone(),
                    onchain_inputs.clone(),
                    vtxo_inputs.clone(),
                    selected_amount,
                    None,
                )
                .await?;

            if resolved_fee == fee && resolved_to_amount == to_amount {
                return self
                    .create_send_on_chain_transaction_from_inputs(
                        to_address,
                        to_amount,
                        onchain_inputs,
                        vtxo_inputs,
                    )
                    .await;
            }

            fee = resolved_fee;
        }

        Err(Error::ad_hoc(
            "failed to converge unilateral completion fee after maximum iterations",
        ))
    }

    async fn resolve_unilateral_completion_fee_and_amount_from_inputs(
        &self,
        to_address: Address,
        onchain_inputs: Vec<unilateral_exit::OnChainInput>,
        vtxo_inputs: Vec<unilateral_exit::VtxoInput>,
        selected_amount: Amount,
        fee_rate_sat_per_vb: Option<f64>,
    ) -> Result<(Amount, Amount), Error> {
        let fee_rate = if let Some(rate) = fee_rate_sat_per_vb {
            rate
        } else {
            timeout_op(self.inner.timeout, self.blockchain().get_fee_rate())
                .await
                .context("Failed to retrieve fee rate")??
        };

        let dust = self.server_info()?.dust;
        let mut fee = Amount::from_sat(UNILATERAL_COMPLETION_FEE_INITIAL_SAT);
        let mut to_amount = selected_amount
            .checked_sub(fee)
            .unwrap_or(Amount::ZERO);

        for _ in 0..UNILATERAL_COMPLETION_FEE_MAX_ITERATIONS {
            if selected_amount <= fee {
                return Err(Error::ad_hoc(format!(
                    "selected amount {selected_amount} does not cover fee {fee}"
                )));
            }
            if to_amount < dust {
                return Err(Error::ad_hoc(format!(
                    "invalid amount {to_amount}, must be greater than dust: {dust}",
                )));
            }

            let (tx, _) = self
                .create_send_on_chain_transaction_from_inputs(
                    to_address.clone(),
                    to_amount,
                    onchain_inputs.clone(),
                    vtxo_inputs.clone(),
                )
                .await?;

            let vsize = tx.weight().to_wu().div_ceil(4);
            let next_fee =
                Amount::from_sat((vsize as f64 * fee_rate).ceil() as u64).max(Amount::from_sat(1));

            if next_fee == fee {
                return Ok((fee, to_amount));
            }

            fee = next_fee;
            to_amount = selected_amount
                .checked_sub(fee)
                .unwrap_or(Amount::ZERO);
        }

        Err(Error::ad_hoc(
            "failed to converge unilateral completion fee after maximum iterations",
        ))
    }

    async fn create_send_on_chain_transaction_from_inputs(
        &self,
        to_address: Address,
        to_amount: Amount,
        onchain_inputs: Vec<unilateral_exit::OnChainInput>,
        vtxo_inputs: Vec<unilateral_exit::VtxoInput>,
    ) -> Result<(Transaction, Vec<TxOut>), Error> {
        let change_address = self.inner.wallet.get_onchain_address()?;

        let sign = move |input: &mut psbt::Input, msg: bitcoin::secp256k1::Message| match &input
            .witness_script
        {
            None => Err(ark_core::Error::ad_hoc(
                "Missing witness script for psbt::Input when signing unilateral exit transaction",
            )),
            Some(script) => {
                let mut res = vec![];
                let pks = extract_checksig_pubkeys(script);

                for pk in pks {
                    if let Ok(keypair) = self.keypair_by_pk(&pk) {
                        let sig = Secp256k1::new().sign_schnorr_no_aux_rand(&msg, &keypair);
                        let pk = keypair.x_only_public_key().0;
                        res.push((sig, pk))
                    }

                    if let Ok(sig) = self.inner.wallet.sign_for_pk(&pk, &msg) {
                        res.push((sig, pk))
                    }
                }

                Ok(res)
            }
        };

        let tx = create_unilateral_exit_transaction(
            to_address,
            to_amount,
            change_address,
            &onchain_inputs,
            &vtxo_inputs,
            sign,
        )
        .map_err(Error::from)?;

        let prevouts = onchain_inputs
            .iter()
            .map(unilateral_exit::OnChainInput::previous_output)
            .chain(
                vtxo_inputs
                    .iter()
                    .map(unilateral_exit::VtxoInput::previous_output),
            )
            .collect();

        Ok((tx, prevouts))
    }
}
