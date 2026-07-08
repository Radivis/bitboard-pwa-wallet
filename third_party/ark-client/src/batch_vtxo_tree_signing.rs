//! VTXO batch-tree musig2 signing (nonce submission + partial signatures).
//!
//! Shared by [`super::Client::join_next_batch`] and [`super::Client::settle_delegate`].

use crate::error::ErrorContext as _;
use crate::wallet::BoardingWallet;
use crate::wallet::OnchainWallet;
use crate::Blockchain;
use crate::Client;
use crate::Error;
use crate::SwapStorage;
use ark_core::batch::aggregate_nonces;
use ark_core::batch::generate_nonce_tree;
use ark_core::batch::sign_batch_tree_tx;
use ark_core::batch::NonceKps;
use ark_core::server::PartialSigTree;
use ark_core::server::TreeNoncesAggregatedEvent;
use ark_core::server::TreeNoncesEvent;
use ark_core::server::TreeSigningStartedEvent;
use ark_core::TxGraph;
use musig::musig::AggregatedNonce;
use bitcoin::key::Keypair;
use bitcoin::Sequence;
use bitcoin::taproot::Signature as TaprootSignature;
use bitcoin::secp256k1::PublicKey;
use bitcoin::Psbt;
use bitcoin::Txid;
use bitcoin::XOnlyPublicKey;
use rand::CryptoRng;
use rand::Rng;
use std::collections::HashMap;
use std::collections::HashSet;
use std::str::FromStr;

#[derive(Debug, PartialEq, Eq, Clone, Copy)]
pub(super) enum BatchProtocolStep {
    Start,
    BatchStarted,
    BatchSigningStarted,
    Finalized,
}

impl BatchProtocolStep {
    pub(super) fn next(self) -> Self {
        match self {
            Self::Start => Self::BatchStarted,
            Self::BatchStarted => Self::BatchSigningStarted,
            Self::BatchSigningStarted => Self::Finalized,
            Self::Finalized => Self::Finalized,
        }
    }
}

/// How a VTXO tree signing handler wants to update the outer batch protocol loop.
#[derive(Debug, PartialEq, Eq, Clone, Copy)]
pub(super) enum VtxoTreeStepUpdate {
    None,
    RestartEventLoop,
}

pub(super) struct VtxoBatchTreeSigningState {
    pub unsigned_commitment_tx: Option<Psbt>,
    pub vtxo_batch_tree_graph_chunks: Option<Vec<ark_core::TxGraphChunk>>,
    pub vtxo_batch_tree_graph: Option<TxGraph>,
    pub agg_nonce_pks: HashMap<Txid, AggregatedNonce>,
    pub our_nonce_trees: Option<HashMap<Keypair, NonceKps>>,
    pub pending_vtxo_tree_signing_started: Option<TreeSigningStartedEvent>,
    pub submitted_vtxo_batch_tree_txids: Option<HashSet<Txid>>,
    pub vtxo_batch_tree_signatures_submitted: bool,
}

impl VtxoBatchTreeSigningState {
    pub(super) fn new() -> Self {
        Self {
            unsigned_commitment_tx: None,
            vtxo_batch_tree_graph_chunks: Some(Vec::new()),
            vtxo_batch_tree_graph: None,
            agg_nonce_pks: HashMap::new(),
            our_nonce_trees: None,
            pending_vtxo_tree_signing_started: None,
            submitted_vtxo_batch_tree_txids: None,
            vtxo_batch_tree_signatures_submitted: false,
        }
    }
}

impl<B, W, S, K> Client<B, W, S, K>
where
    B: Blockchain,
    W: BoardingWallet + OnchainWallet,
    S: SwapStorage + 'static,
    K: crate::KeyProvider,
{
    pub(super) async fn handle_vtxo_tree_tx_chunk<R>(
        &self,
        rng: &mut R,
        step: &mut BatchProtocolStep,
        state: &mut VtxoBatchTreeSigningState,
        batch_id: &Option<String>,
        own_cosigner_kps: &[Keypair],
        own_cosigner_pks: &[PublicKey],
        chunk: ark_core::TxGraphChunk,
    ) -> Result<VtxoTreeStepUpdate, Error>
    where
        R: Rng + CryptoRng,
    {
        match &mut state.vtxo_batch_tree_graph_chunks {
            Some(vtxo_batch_tree_graph_chunks) => {
                tracing::debug!("Got new VTXO batch-tree graph chunk");
                vtxo_batch_tree_graph_chunks.push(chunk);
            }
            None => {
                return Err(Error::ark_server(
                    "received unexpected VTXO batch-tree graph chunk",
                ));
            }
        };

        match *step {
            BatchProtocolStep::BatchStarted => {
                if self
                    .try_flush_pending_vtxo_tree_signing_started(
                        rng,
                        &mut state.pending_vtxo_tree_signing_started,
                        &state.vtxo_batch_tree_graph_chunks,
                        &mut state.vtxo_batch_tree_graph,
                        &mut state.our_nonce_trees,
                        &mut state.unsigned_commitment_tx,
                        &mut state.submitted_vtxo_batch_tree_txids,
                        own_cosigner_kps,
                        own_cosigner_pks,
                    )
                    .await?
                {
                    *step = (*step).next();
                }
            }
            BatchProtocolStep::BatchSigningStarted => {
                let chunks = state.vtxo_batch_tree_graph_chunks.as_ref().ok_or_else(|| {
                    Error::ark_server(
                        "missing VTXO batch-tree graph chunks during late chunk handling",
                    )
                })?;
                let commitment = state.unsigned_commitment_tx.as_ref().ok_or(
                    Error::ark_server("missing commitment TX during late chunk handling"),
                )?;
                let batch_id = batch_id.as_deref().ok_or_else(|| {
                    Error::ark_server("missing batch ID during late chunk handling")
                })?;
                self.reconcile_vtxo_batch_tree_nonces(
                    rng,
                    chunks,
                    &mut state.vtxo_batch_tree_graph,
                    &mut state.our_nonce_trees,
                    commitment,
                    batch_id,
                    own_cosigner_kps,
                    &mut state.agg_nonce_pks,
                    &mut state.submitted_vtxo_batch_tree_txids,
                    &mut state.vtxo_batch_tree_signatures_submitted,
                )
                .await?;
            }
            _ => {}
        }

        Ok(VtxoTreeStepUpdate::None)
    }

    pub(super) fn apply_vtxo_tree_signature(
        state: &mut VtxoBatchTreeSigningState,
        txid: Txid,
        signature: TaprootSignature,
    ) -> Result<(), Error> {
        match state.vtxo_batch_tree_graph {
            Some(ref mut vtxo_batch_tree_graph) => {
                vtxo_batch_tree_graph.apply(|graph| {
                    if graph.root().unsigned_tx.compute_txid() != txid {
                        Ok(true)
                    } else {
                        graph.set_signature(signature);
                        Ok(false)
                    }
                })?;
            }
            None => {
                return Err(Error::ark_server(
                    "received batch-tree signature without transaction graph",
                ));
            }
        }
        Ok(())
    }

    pub(super) async fn handle_tree_signing_started<R>(
        &self,
        rng: &mut R,
        step: &mut BatchProtocolStep,
        state: &mut VtxoBatchTreeSigningState,
        signing: TreeSigningStartedEvent,
        own_cosigner_kps: &[Keypair],
        own_cosigner_pks: &[PublicKey],
    ) -> Result<(), Error>
    where
        R: Rng + CryptoRng,
    {
        state.pending_vtxo_tree_signing_started = Some(signing);

        if self
            .try_flush_pending_vtxo_tree_signing_started(
                rng,
                &mut state.pending_vtxo_tree_signing_started,
                &state.vtxo_batch_tree_graph_chunks,
                &mut state.vtxo_batch_tree_graph,
                &mut state.our_nonce_trees,
                &mut state.unsigned_commitment_tx,
                &mut state.submitted_vtxo_batch_tree_txids,
                own_cosigner_kps,
                own_cosigner_pks,
            )
            .await?
        {
            *step = (*step).next();
        }

        Ok(())
    }

    pub(super) async fn handle_tree_nonces<R>(
        &self,
        rng: &mut R,
        step: &mut BatchProtocolStep,
        state: &mut VtxoBatchTreeSigningState,
        batch_id: &Option<String>,
        network_client: &ark_grpc::Client,
        ark_forfeit_pk: XOnlyPublicKey,
        batch_expiry: Option<Sequence>,
        own_cosigner_kps: &[Keypair],
        own_cosigner_pks: &[PublicKey],
        event: TreeNoncesEvent,
    ) -> Result<VtxoTreeStepUpdate, Error>
    where
        R: Rng + CryptoRng,
    {
        if *step == BatchProtocolStep::BatchStarted {
            if self
                .try_flush_pending_vtxo_tree_signing_started(
                    rng,
                    &mut state.pending_vtxo_tree_signing_started,
                    &state.vtxo_batch_tree_graph_chunks,
                    &mut state.vtxo_batch_tree_graph,
                    &mut state.our_nonce_trees,
                    &mut state.unsigned_commitment_tx,
                    &mut state.submitted_vtxo_batch_tree_txids,
                    own_cosigner_kps,
                    own_cosigner_pks,
                )
                .await?
            {
                *step = BatchProtocolStep::BatchSigningStarted;
            }
        }

        if *step != BatchProtocolStep::BatchSigningStarted {
            return Ok(VtxoTreeStepUpdate::None);
        }

        let tree_tx_nonce_pks = event.nonces;

        let cosigner_pk = match tree_tx_nonce_pks.0.iter().find(|(pk, _)| {
            own_cosigner_pks
                .iter()
                .any(|p| p.x_only_public_key().0 == **pk)
        }) {
            Some((pk, _)) => *pk,
            None => {
                tracing::debug!(
                    batch_id = event.id,
                    txid = %event.txid,
                    "Received irrelevant TreeNonces event"
                );
                return Ok(VtxoTreeStepUpdate::None);
            }
        };

        tracing::debug!(
            batch_id = event.id,
            txid = %event.txid,
            %cosigner_pk,
            "Received TreeNonces event"
        );

        state
            .agg_nonce_pks
            .insert(event.txid, aggregate_nonces(tree_tx_nonce_pks));

        if self
            .reconcile_vtxo_batch_tree_nonces_after_nonce_event(
                rng,
                state,
                batch_id,
                own_cosigner_kps,
            )
            .await?
        {
            return Ok(VtxoTreeStepUpdate::RestartEventLoop);
        }

        let cosigner_kp = own_cosigner_kps
            .iter()
            .find(|kp| kp.public_key().x_only_public_key().0 == cosigner_pk)
            .ok_or_else(|| Error::ad_hoc("no cosigner keypair to sign for own PK"))?;

        self.submit_vtxo_tree_signatures_if_ready(
            state,
            network_client,
            &event.id,
            ark_forfeit_pk,
            batch_expiry,
            cosigner_kp,
        )
        .await?;

        Ok(VtxoTreeStepUpdate::None)
    }

    pub(super) async fn handle_tree_nonces_aggregated<R>(
        &self,
        rng: &mut R,
        step: &mut BatchProtocolStep,
        state: &mut VtxoBatchTreeSigningState,
        batch_id: &Option<String>,
        network_client: &ark_grpc::Client,
        ark_forfeit_pk: XOnlyPublicKey,
        batch_expiry: Option<Sequence>,
        own_cosigner_kps: &[Keypair],
        own_cosigner_pks: &[PublicKey],
        event: TreeNoncesAggregatedEvent,
    ) -> Result<VtxoTreeStepUpdate, Error>
    where
        R: Rng + CryptoRng,
    {
        if *step == BatchProtocolStep::BatchStarted {
            if self
                .try_flush_pending_vtxo_tree_signing_started(
                    rng,
                    &mut state.pending_vtxo_tree_signing_started,
                    &state.vtxo_batch_tree_graph_chunks,
                    &mut state.vtxo_batch_tree_graph,
                    &mut state.our_nonce_trees,
                    &mut state.unsigned_commitment_tx,
                    &mut state.submitted_vtxo_batch_tree_txids,
                    own_cosigner_kps,
                    own_cosigner_pks,
                )
                .await?
            {
                *step = BatchProtocolStep::BatchSigningStarted;
            }
        }

        if *step != BatchProtocolStep::BatchSigningStarted {
            return Ok(VtxoTreeStepUpdate::None);
        }

        tracing::debug!(batch_id = event.id, "Batch combined nonces generated");

        for (txid_str, _) in event.tree_nonces.encode() {
            let txid = Txid::from_str(&txid_str)
                .map_err(|error| Error::ad_hoc(error.to_string()))?;
            let pub_nonce = event.tree_nonces.get(&txid).ok_or_else(|| {
                Error::ark_server(format!("missing aggregated tree nonce for TX {txid}"))
            })?;
            let agg_nonce_pk = AggregatedNonce::new(&[&pub_nonce]);
            state.agg_nonce_pks.insert(txid, agg_nonce_pk);
        }

        if self
            .reconcile_vtxo_batch_tree_nonces_after_nonce_event(
                rng,
                state,
                batch_id,
                own_cosigner_kps,
            )
            .await?
        {
            return Ok(VtxoTreeStepUpdate::RestartEventLoop);
        }

        let cosigner_kp = own_cosigner_kps
            .first()
            .ok_or_else(|| Error::ad_hoc("no cosigner keypair to sign for own PK"))?;

        self.submit_vtxo_tree_signatures_if_ready(
            state,
            network_client,
            &event.id,
            ark_forfeit_pk,
            batch_expiry,
            cosigner_kp,
        )
        .await?;

        Ok(VtxoTreeStepUpdate::None)
    }

    async fn reconcile_vtxo_batch_tree_nonces_after_nonce_event<R>(
        &self,
        rng: &mut R,
        state: &mut VtxoBatchTreeSigningState,
        batch_id: &Option<String>,
        own_cosigner_kps: &[Keypair],
    ) -> Result<bool, Error>
    where
        R: Rng + CryptoRng,
    {
        let (Some(commitment), Some(batch_id_str)) =
            (state.unsigned_commitment_tx.as_ref(), batch_id.as_deref())
        else {
            return Ok(false);
        };

        let chunks = state.vtxo_batch_tree_graph_chunks.as_ref().ok_or_else(|| {
            Error::ark_server(
                "received batch-tree nonces event without VTXO batch-tree graph chunks",
            )
        })?;

        self.reconcile_vtxo_batch_tree_nonces(
            rng,
            chunks,
            &mut state.vtxo_batch_tree_graph,
            &mut state.our_nonce_trees,
            commitment,
            batch_id_str,
            own_cosigner_kps,
            &mut state.agg_nonce_pks,
            &mut state.submitted_vtxo_batch_tree_txids,
            &mut state.vtxo_batch_tree_signatures_submitted,
        )
        .await
    }

    async fn submit_vtxo_tree_signatures_if_ready(
        &self,
        state: &mut VtxoBatchTreeSigningState,
        network_client: &ark_grpc::Client,
        batch_id: &str,
        ark_forfeit_pk: XOnlyPublicKey,
        batch_expiry: Option<Sequence>,
        cosigner_kp: &Keypair,
    ) -> Result<(), Error> {
        let vtxo_batch_tree_graph_ref = state
            .vtxo_batch_tree_graph
            .as_ref()
            .ok_or_else(|| Error::ark_server("missing VTXO batch-tree graph during signing"))?;

        if state.vtxo_batch_tree_signatures_submitted
            || state.agg_nonce_pks.len() != vtxo_batch_tree_graph_ref.nb_of_nodes()
        {
            return Ok(());
        }

        let our_nonce_trees = state
            .our_nonce_trees
            .as_mut()
            .ok_or(Error::ark_server("missing nonce trees during batch protocol"))?;

        let our_nonce_tree = our_nonce_trees
            .get_mut(cosigner_kp)
            .ok_or(Error::ark_server("missing nonce tree during batch protocol"))?;

        let unsigned_commitment_tx = state
            .unsigned_commitment_tx
            .as_ref()
            .ok_or_else(|| Error::ad_hoc("missing commitment TX"))?;

        let batch_expiry = batch_expiry.ok_or_else(|| Error::ad_hoc("missing batch expiry"))?;

        let mut partial_sig_tree = PartialSigTree::default();
        for (txid, _) in vtxo_batch_tree_graph_ref.as_map() {
            let agg_nonce_pk = state.agg_nonce_pks.get(&txid).ok_or_else(|| {
                Error::ad_hoc(format!("missing aggregated nonce PK for TX {txid}"))
            })?;

            let sigs = sign_batch_tree_tx(
                txid,
                batch_expiry,
                ark_forfeit_pk,
                cosigner_kp,
                *agg_nonce_pk,
                vtxo_batch_tree_graph_ref,
                unsigned_commitment_tx,
                our_nonce_tree,
            )
            .map_err(Error::from)
            .context("failed to sign VTXO batch-tree transactions")?;

            partial_sig_tree.0.extend(sigs.0);
        }

        network_client
            .submit_tree_signatures(batch_id, cosigner_kp.public_key(), partial_sig_tree)
            .await
            .map_err(Error::ark_server)
            .context("failed to submit VTXO batch-tree signatures")?;

        state.vtxo_batch_tree_signatures_submitted = true;
        Ok(())
    }

    fn vtxo_batch_tree_txids(graph: &TxGraph) -> HashSet<Txid> {
        graph.as_map().keys().copied().collect()
    }

    async fn submit_vtxo_batch_tree_nonces_for_graph<R>(
        &self,
        rng: &mut R,
        batch_id: &str,
        vtxo_batch_tree_graph: &TxGraph,
        unsigned_commitment_tx: &Psbt,
        own_cosigner_kps: &[Keypair],
    ) -> Result<HashMap<Keypair, NonceKps>, Error>
    where
        R: Rng + CryptoRng,
    {
        let network_client = self.network_client();
        let mut our_nonce_tree_map = HashMap::new();
        for own_cosigner_kp in own_cosigner_kps {
            let own_cosigner_pk = own_cosigner_kp.public_key();
            let nonce_tree = generate_nonce_tree(
                rng,
                vtxo_batch_tree_graph,
                own_cosigner_pk,
                unsigned_commitment_tx,
            )
            .map_err(Error::from)
            .context("failed to generate VTXO nonce tree")?;

            tracing::info!(
                cosigner_pk = %own_cosigner_pk,
                "Submitting nonce tree for cosigner PK"
            );

            network_client
                .submit_tree_nonces(
                    batch_id,
                    own_cosigner_pk,
                    nonce_tree.to_nonce_pks(),
                )
                .await
                .map_err(Error::ark_server)
                .context("failed to submit VTXO nonce tree")?;

            our_nonce_tree_map.insert(*own_cosigner_kp, nonce_tree);
        }

        Ok(our_nonce_tree_map)
    }

    async fn begin_vtxo_batch_tree_signing<R>(
        &self,
        rng: &mut R,
        signing: TreeSigningStartedEvent,
        vtxo_batch_tree_graph_chunks: &[ark_core::TxGraphChunk],
        own_cosigner_kps: &[Keypair],
        own_cosigner_pks: &[PublicKey],
    ) -> Result<(TxGraph, HashMap<Keypair, NonceKps>, Psbt), Error>
    where
        R: Rng + CryptoRng,
    {
        if vtxo_batch_tree_graph_chunks.is_empty() {
            return Err(Error::ark_server(
                "cannot begin VTXO batch-tree signing without graph chunks",
            ));
        }

        let vtxo_batch_tree_graph = TxGraph::new(vtxo_batch_tree_graph_chunks.to_vec())
            .map_err(Error::from)
            .context("failed to build VTXO batch-tree graph before generating nonces")?;

        tracing::info!(batch_id = signing.id, "Batch signing started");

        for own_cosigner_pk in own_cosigner_pks.iter() {
            if !signing
                .cosigners_pubkeys
                .iter()
                .any(|p| p == own_cosigner_pk)
            {
                return Err(Error::ark_server(format!(
                    "own cosigner PK is not present in cosigner PKs: {own_cosigner_pk}"
                )));
            }
        }

        let our_nonce_tree_map = self
            .submit_vtxo_batch_tree_nonces_for_graph(
                rng,
                &signing.id,
                &vtxo_batch_tree_graph,
                &signing.unsigned_commitment_tx,
                own_cosigner_kps,
            )
            .await?;

        Ok((
            vtxo_batch_tree_graph,
            our_nonce_tree_map,
            signing.unsigned_commitment_tx,
        ))
    }

    async fn try_flush_pending_vtxo_tree_signing_started<R>(
        &self,
        rng: &mut R,
        pending_vtxo_tree_signing_started: &mut Option<TreeSigningStartedEvent>,
        vtxo_batch_tree_graph_chunks: &Option<Vec<ark_core::TxGraphChunk>>,
        vtxo_batch_tree_graph: &mut Option<TxGraph>,
        our_nonce_trees: &mut Option<HashMap<Keypair, NonceKps>>,
        unsigned_commitment_tx: &mut Option<Psbt>,
        submitted_vtxo_batch_tree_txids: &mut Option<HashSet<Txid>>,
        own_cosigner_kps: &[Keypair],
        own_cosigner_pks: &[PublicKey],
    ) -> Result<bool, Error>
    where
        R: Rng + CryptoRng,
    {
        let Some(signing) = pending_vtxo_tree_signing_started.take() else {
            return Ok(false);
        };

        let Some(chunks) = vtxo_batch_tree_graph_chunks.as_ref() else {
            *pending_vtxo_tree_signing_started = Some(signing);
            return Ok(false);
        };

        if chunks.is_empty() {
            *pending_vtxo_tree_signing_started = Some(signing);
            return Ok(false);
        }

        let (graph, nonce_map, commitment) = self
            .begin_vtxo_batch_tree_signing(
                rng,
                signing,
                chunks,
                own_cosigner_kps,
                own_cosigner_pks,
            )
            .await?;

        *submitted_vtxo_batch_tree_txids = Some(Self::vtxo_batch_tree_txids(&graph));
        *vtxo_batch_tree_graph = Some(graph);
        *our_nonce_trees = Some(nonce_map);
        *unsigned_commitment_tx = Some(commitment);

        Ok(true)
    }

    async fn reconcile_vtxo_batch_tree_nonces<R>(
        &self,
        rng: &mut R,
        vtxo_batch_tree_graph_chunks: &[ark_core::TxGraphChunk],
        vtxo_batch_tree_graph: &mut Option<TxGraph>,
        our_nonce_trees: &mut Option<HashMap<Keypair, NonceKps>>,
        unsigned_commitment_tx: &Psbt,
        batch_id: &str,
        own_cosigner_kps: &[Keypair],
        agg_nonce_pks: &mut HashMap<Txid, AggregatedNonce>,
        submitted_vtxo_batch_tree_txids: &mut Option<HashSet<Txid>>,
        vtxo_batch_tree_signatures_submitted: &mut bool,
    ) -> Result<bool, Error>
    where
        R: Rng + CryptoRng,
    {
        let rebuilt = TxGraph::new(vtxo_batch_tree_graph_chunks.to_vec())
            .map_err(Error::from)
            .context("failed to rebuild VTXO batch-tree graph from buffered chunks")?;
        let rebuilt_txids = Self::vtxo_batch_tree_txids(&rebuilt);
        *vtxo_batch_tree_graph = Some(rebuilt);

        if submitted_vtxo_batch_tree_txids.as_ref() == Some(&rebuilt_txids) {
            return Ok(false);
        }

        tracing::warn!(
            batch_id,
            previous_nodes = submitted_vtxo_batch_tree_txids
                .as_ref()
                .map(|txids| txids.len())
                .unwrap_or(0),
            new_nodes = rebuilt_txids.len(),
            "VTXO batch-tree graph changed; refreshing submitted nonces"
        );

        let vtxo_batch_tree_graph_ref = vtxo_batch_tree_graph
            .as_ref()
            .expect("rebuilt graph stored above");
        let nonce_map = self
            .submit_vtxo_batch_tree_nonces_for_graph(
                rng,
                batch_id,
                vtxo_batch_tree_graph_ref,
                unsigned_commitment_tx,
                own_cosigner_kps,
            )
            .await?;

        *our_nonce_trees = Some(nonce_map);
        *submitted_vtxo_batch_tree_txids = Some(rebuilt_txids);
        agg_nonce_pks.clear();
        *vtxo_batch_tree_signatures_submitted = false;

        Ok(true)
    }
}
