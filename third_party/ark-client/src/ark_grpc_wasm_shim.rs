//! WASM-compatible `ark_grpc` surface backed by [`ark_rest::Client`].

use std::fmt;
use std::sync::Arc;

use ark_core::asset::AssetId;
use ark_core::intent;
use ark_core::server::{
    self, ChainedTxType, FinalizeOffchainTxResponse, GetVtxosRequest, IndexerPage,
    PendingTx, StreamEvent, SubmitOffchainTxResponse, SubscriptionResponse,
    VirtualTxsResponse, VtxoChain, VtxoChains,
};
use ark_rest::apis::ark_service_api::{
    ark_service_estimate_intent_fee, ark_service_get_pending_tx,
};
use ark_rest::apis::indexer_service_api::indexer_service_get_vtxo_chain;
use ark_rest::apis::indexer_service_api::indexer_service_get_asset;
use ark_rest::models::{EstimateIntentFeeRequest, GetPendingTxRequest, IndexerChainedTxType};
use bitcoin::hex::FromHex;
use bitcoin::secp256k1::PublicKey;
use bitcoin::OutPoint;
use bitcoin::Psbt;
use bitcoin::SignedAmount;
use bitcoin::Txid;
use futures::Stream;
use futures::StreamExt;

pub use ark_rest::ListVtxosResponse;

pub struct Error {
    inner: ErrorImpl,
}

struct ErrorImpl {
    kind: Kind,
    source: Option<Box<dyn std::error::Error + Send + Sync>>,
}

#[derive(Debug)]
#[allow(dead_code)]
enum Kind {
    Connect,
    NotConnected,
    Request,
    Conversion,
    EventStreamDisconnect,
    EventStream,
}

impl Error {
    fn new(kind: Kind) -> Self {
        Self {
            inner: ErrorImpl {
                kind,
                source: None,
            },
        }
    }

    pub(crate) fn with(mut self, source: impl std::error::Error + Send + Sync + 'static) -> Self {
        self.inner.source = Some(Box::new(source));
        self
    }

    #[allow(dead_code)]
    pub(crate) fn connect(source: impl std::error::Error + Send + Sync + 'static) -> Self {
        Error::new(Kind::Connect).with(source)
    }

    #[allow(dead_code)]
    pub(crate) fn not_connected() -> Self {
        Error::new(Kind::NotConnected)
    }

    pub(crate) fn request(source: impl std::error::Error + Send + Sync + 'static) -> Self {
        Error::new(Kind::Request).with(source)
    }

    pub(crate) fn conversion(source: impl std::error::Error + Send + Sync + 'static) -> Self {
        Error::new(Kind::Conversion).with(source)
    }

    fn conversion_message(message: impl fmt::Display) -> Self {
        Error::conversion(std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            message.to_string(),
        ))
    }

    #[allow(dead_code)]
    pub(crate) fn event_stream(source: impl std::error::Error + Send + Sync + 'static) -> Self {
        Error::new(Kind::EventStream).with(source)
    }

    pub fn is_version_mismatch(&self) -> bool {
        if let Some(source) = &self.inner.source {
            let message = source.to_string();
            return message.contains("BUILD_VERSION_TOO_OLD");
        }
        false
    }

    pub fn is_server_info_changed(&self) -> bool {
        if let Some(source) = &self.inner.source {
            if let Some(rest_error) = source.downcast_ref::<ark_rest::Error>() {
                return rest_error.is_server_info_changed();
            }
        }
        false
    }
}

impl fmt::Debug for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_tuple("ark_grpc::Error")
            .field(&self.inner.kind)
            .field(&self.inner.source)
            .finish()
    }
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match &self.inner.kind {
            Kind::Request => {
                if let Some(source) = &self.inner.source {
                    if let Some(rest_error) = source.downcast_ref::<ark_rest::Error>() {
                        return f.write_str(&format_rest_request_error(rest_error));
                    }
                    write!(f, "request failed: {source}")
                } else {
                    f.write_str("request failed")
                }
            }
            kind => {
                let description = match kind {
                    Kind::Connect => "failed to connect to Ark server",
                    Kind::NotConnected => "no connection to Ark server",
                    Kind::Conversion => "failed to convert between types",
                    Kind::EventStreamDisconnect => "got disconnected from event stream",
                    Kind::EventStream => "error via event stream",
                    Kind::Request => unreachable!("handled above"),
                };
                write!(f, "{description}")?;
                if let Some(source) = &self.inner.source {
                    write!(f, ": {source}")?;
                }
                Ok(())
            }
        }
    }
}

impl std::error::Error for Error {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        self.inner
            .source
            .as_ref()
            .map(|source| source.as_ref() as &(dyn std::error::Error + 'static))
    }
}

fn format_rest_request_error(rest_error: &ark_rest::Error) -> String {
    let chain = rest_error.display_chain();
    if chain.contains("Event stream") || chain.contains("batch/events") {
        format!("batch event stream: {chain}")
    } else {
        chain
    }
}

fn map_rest_error(error: ark_rest::Error) -> Error {
    Error::request(error)
}

fn map_apis_error<E: fmt::Debug>(error: ark_rest::apis::Error<E>) -> Error {
    Error::request(std::io::Error::new(
        std::io::ErrorKind::Other,
        error.to_string(),
    ))
}

#[derive(Clone)]
pub struct Client {
    inner: Arc<ark_rest::Client>,
}

impl fmt::Debug for Client {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("ark_grpc::Client").finish_non_exhaustive()
    }
}

impl Client {
    pub fn new(url: String) -> Self {
        Self {
            inner: Arc::new(
                ark_rest::Client::new(url).expect("failed to create ark REST client"),
            ),
        }
    }

    pub async fn connect(&mut self) -> Result<(), Error> {
        self.inner
            .get_info()
            .await
            .map(|_| ())
            .map_err(map_rest_error)
    }

    pub async fn get_info(&mut self) -> Result<server::Info, Error> {
        self.inner.get_info().await.map_err(map_rest_error)
    }

    pub async fn list_vtxos(
        &self,
        request: GetVtxosRequest,
    ) -> Result<ListVtxosResponse, Error> {
        self.inner.list_vtxos(request).await.map_err(map_rest_error)
    }

    pub async fn register_intent(&self, intent: intent::Intent) -> Result<String, Error> {
        let message_json = intent
            .serialize_message()
            .map_err(Error::conversion_message)?;
        let message: intent::IntentMessage = serde_json::from_str(&message_json)
            .map_err(Error::conversion_message)?;
        self.inner
            .register_intent(&message, &intent.proof)
            .await
            .map_err(map_rest_error)
    }

    pub async fn submit_offchain_transaction_request(
        &self,
        ark_tx: Psbt,
        checkpoint_txs: Vec<Psbt>,
    ) -> Result<SubmitOffchainTxResponse, Error> {
        self.inner
            .submit_offchain_transaction_request(ark_tx, checkpoint_txs)
            .await
            .map_err(map_rest_error)
    }

    pub async fn finalize_offchain_transaction(
        &self,
        txid: Txid,
        checkpoint_txs: Vec<Psbt>,
    ) -> Result<FinalizeOffchainTxResponse, Error> {
        self.inner
            .finalize_offchain_transaction(txid, checkpoint_txs)
            .await
            .map_err(map_rest_error)
    }

    pub fn set_info_refresh_hook(
        &mut self,
        hook: impl Fn(server::Info) -> Result<(), Box<dyn std::error::Error + Send + Sync + 'static>>
            + Send
            + Sync
            + 'static,
    ) {
        if let Some(inner) = Arc::get_mut(&mut self.inner) {
            inner.set_info_refresh_hook(hook);
        }
    }

    pub async fn get_pending_tx(
        &self,
        intent_value: intent::Intent,
    ) -> Result<Vec<PendingTx>, Error> {
        let message_json = intent_value
            .serialize_message()
            .map_err(Error::conversion_message)?;
        let proof = intent_value.serialize_proof();
        let configuration = self.inner.configuration().map_err(map_rest_error)?;
        let response = ark_service_get_pending_tx(
            &configuration,
            GetPendingTxRequest {
                intent: Some(ark_rest::models::Intent {
                    message: Some(message_json),
                    proof: Some(proof),
                }),
            },
        )
        .await
        .map_err(map_apis_error)?;

        let mut pending = Vec::new();
        for tx in response.pending_txs.unwrap_or_default() {
            let ark_txid = tx
                .ark_txid
                .ok_or_else(|| Error::conversion_message("missing ark txid"))?
                .parse::<Txid>()
                .map_err(Error::conversion_message)?;
            let signed_ark_tx = decode_psbt_field(
                tx.final_ark_tx
                    .ok_or_else(|| Error::conversion_message("missing signed ark tx"))?,
            )?;
            let signed_checkpoint_txs = tx
                .signed_checkpoint_txs
                .unwrap_or_default()
                .into_iter()
                .map(decode_psbt_field)
                .collect::<Result<Vec<_>, Error>>()?;
            pending.push(PendingTx {
                ark_txid,
                signed_ark_tx,
                signed_checkpoint_txs,
            });
        }
        Ok(pending)
    }

    pub async fn confirm_registration(&self, intent_id: String) -> Result<(), Error> {
        self.inner
            .confirm_registration(intent_id)
            .await
            .map_err(map_rest_error)
    }

    pub async fn submit_tree_nonces(
        &self,
        batch_id: &str,
        cosigner_pubkey: PublicKey,
        pub_nonce_tree: server::NoncePks,
    ) -> Result<(), Error> {
        self.inner
            .submit_tree_nonces(batch_id, cosigner_pubkey, pub_nonce_tree)
            .await
            .map_err(map_rest_error)
    }

    pub async fn submit_tree_signatures(
        &self,
        batch_id: &str,
        cosigner_pk: PublicKey,
        partial_sig_tree: server::PartialSigTree,
    ) -> Result<(), Error> {
        self.inner
            .submit_tree_signatures(batch_id, cosigner_pk, partial_sig_tree)
            .await
            .map_err(map_rest_error)
    }

    pub async fn submit_signed_forfeit_txs(
        &self,
        signed_forfeit_psbts: Vec<Psbt>,
        commitment_psbt: Option<Psbt>,
    ) -> Result<(), Error> {
        self.inner
            .submit_signed_forfeit_txs(signed_forfeit_psbts, commitment_psbt)
            .await
            .map_err(map_rest_error)
    }

    pub async fn get_event_stream(
        &self,
        topics: Vec<String>,
    ) -> Result<impl Stream<Item = Result<StreamEvent, Error>> + Unpin, Error> {
        let stream = self
            .inner
            .get_event_stream(topics)
            .await
            .map_err(map_rest_error)?;
        Ok(stream
            .map(|result| result.map_err(map_rest_error))
            .boxed_local())
    }

    pub async fn get_vtxo_chain(
        &self,
        outpoint: Option<OutPoint>,
        size_and_index: Option<(i32, i32)>,
    ) -> Result<VtxoChainResponse, Error> {
        let outpoint = outpoint.ok_or_else(|| Error::conversion_message("missing outpoint"))?;
        let (page_size, page_index) = size_and_index
            .map(|(size, index)| (Some(size), Some(index)))
            .unwrap_or((None, None));
        let configuration = self.inner.configuration().map_err(map_rest_error)?;
        let response = indexer_service_get_vtxo_chain(
            &configuration,
            &outpoint.txid.to_string(),
            outpoint.vout as i32,
            page_size,
            page_index,
        )
        .await
        .map_err(map_apis_error)?;

        response.try_into()
    }

    pub async fn get_virtual_txs(
        &self,
        txids: Vec<String>,
        size_and_index: Option<(i32, i32)>,
    ) -> Result<VirtualTxsResponse, Error> {
        self.inner
            .get_virtual_txs(txids, size_and_index)
            .await
            .map_err(map_rest_error)
    }

    pub async fn subscribe_to_scripts(
        &self,
        scripts: Vec<ark_core::ArkAddress>,
        subscription_id: Option<String>,
    ) -> Result<String, Error> {
        self.inner
            .subscribe_to_scripts(scripts, subscription_id)
            .await
            .map_err(map_rest_error)
    }

    pub async fn unsubscribe_from_scripts(
        &self,
        scripts: Vec<ark_core::ArkAddress>,
        subscription_id: String,
    ) -> Result<(), Error> {
        self.inner
            .unsubscribe_from_scripts(scripts, subscription_id)
            .await
            .map_err(map_rest_error)
    }

    pub async fn get_subscription(
        &self,
        subscription_id: String,
    ) -> Result<impl Stream<Item = Result<SubscriptionResponse, Error>> + Unpin, Error> {
        let stream = self
            .inner
            .get_subscription(subscription_id)
            .await
            .map_err(map_rest_error)?;
        Ok(stream
            .map(|result| result.map_err(map_rest_error))
            .boxed_local())
    }

    pub async fn estimate_fees(&self, intent: intent::Intent) -> Result<SignedAmount, Error> {
        let message_json = intent
            .serialize_message()
            .map_err(Error::conversion_message)?;
        let proof = intent.serialize_proof();
        let configuration = self.inner.configuration().map_err(map_rest_error)?;
        let response = ark_service_estimate_intent_fee(
            &configuration,
            EstimateIntentFeeRequest {
                intent: Some(ark_rest::models::Intent {
                    message: Some(message_json),
                    proof: Some(proof),
                }),
            },
        )
        .await
        .map_err(map_apis_error)?;
        let fee = match response.fee {
            Some(fee) => fee
                .parse::<i64>()
                .map_err(Error::conversion_message)?,
            None => 0,
        };
        Ok(SignedAmount::from_sat(fee))
    }

    pub async fn get_asset(&self, asset_id: AssetId) -> Result<server::AssetInfo, Error> {
        let configuration = self.inner.configuration().map_err(map_rest_error)?;
        let response = indexer_service_get_asset(
            &configuration,
            &asset_id.to_string(),
        )
        .await
        .map_err(map_apis_error)?;

        let supply = response
            .supply
            .ok_or_else(|| Error::conversion_message("missing supply"))?
            .parse::<u64>()
            .map_err(Error::conversion_message)?;
        let asset_id = response
            .asset_id
            .ok_or_else(|| Error::conversion_message("missing asset id"))?
            .parse()
            .map_err(Error::conversion_message)?;
        let control_asset_id = match response.control_asset {
            Some(control_asset) if !control_asset.is_empty() => Some(
                control_asset
                    .parse()
                    .map_err(Error::conversion_message)?,
            ),
            _ => None,
        };

        Ok(server::AssetInfo {
            asset_id,
            control_asset_id,
            supply,
            metadata: response.metadata.unwrap_or_default(),
        })
    }
}

pub struct VtxoChainResponse {
    pub chains: VtxoChains,
    pub page: Option<IndexerPage>,
}

impl TryFrom<ark_rest::models::GetVtxoChainResponse> for VtxoChainResponse {
    type Error = Error;

    fn try_from(value: ark_rest::models::GetVtxoChainResponse) -> Result<Self, Self::Error> {
        let chains = value
            .chain
            .unwrap_or_default()
            .iter()
            .map(indexer_chain_to_vtxo_chain)
            .collect::<Result<Vec<_>, Error>>()?;

        let page = value
            .page
            .map(|page| IndexerPage {
                current: page.current.unwrap_or_default(),
                next: page.next.unwrap_or_default(),
                total: page.total.unwrap_or_default(),
            });

        Ok(VtxoChainResponse {
            chains: VtxoChains { inner: chains },
            page,
        })
    }
}

fn indexer_chain_to_vtxo_chain(value: &ark_rest::models::IndexerChain) -> Result<VtxoChain, Error> {
        let spends = value
            .spends
            .clone()
            .unwrap_or_default()
            .iter()
            .map(|txid| {
                let txid_str = if txid.len() == 66 { &txid[..64] } else { txid.as_str() };
                txid_str
                    .parse()
                    .map_err(|error: bitcoin::hex::HexToArrayError| Error::conversion_message(error))
            })
            .collect::<Result<Vec<_>, Error>>()?;

        let tx_type = match value.r#type {
            Some(IndexerChainedTxType::IndexerChainedTxTypeUnspecified) | None => {
                ChainedTxType::Unspecified
            }
            Some(IndexerChainedTxType::IndexerChainedTxTypeCommitment) => {
                ChainedTxType::Commitment
            }
            Some(IndexerChainedTxType::IndexerChainedTxTypeArk) => ChainedTxType::Ark,
            Some(IndexerChainedTxType::IndexerChainedTxTypeTree) => ChainedTxType::Tree,
            Some(IndexerChainedTxType::IndexerChainedTxTypeCheckpoint) => {
                ChainedTxType::Checkpoint
            }
        };

        let txid = value
            .txid
            .as_ref()
            .ok_or_else(|| Error::conversion_message("missing txid"))?
            .parse()
            .map_err(|error: bitcoin::hex::HexToArrayError| Error::conversion_message(error))?;

        Ok(VtxoChain {
            txid,
            tx_type,
            spends,
            expires_at: value
                .expires_at
                .as_ref()
                .map(|value| {
                    value
                        .parse::<i64>()
                        .map_err(|error| Error::conversion_message(error))
                })
                .transpose()?
                .unwrap_or_default(),
        })
}

fn decode_psbt_field(encoded: String) -> Result<Psbt, Error> {
    use bitcoin::base64::Engine as _;
    let base64 = bitcoin::base64::engine::GeneralPurpose::new(
        &bitcoin::base64::alphabet::STANDARD,
        bitcoin::base64::engine::GeneralPurposeConfig::new(),
    );
    if let Ok(bytes) = Vec::from_hex(&encoded) {
        return Psbt::deserialize(&bytes).map_err(Error::conversion_message);
    }
    let bytes = base64
        .decode(encoded)
        .map_err(Error::conversion_message)?;
    Psbt::deserialize(&bytes).map_err(Error::conversion_message)
}
