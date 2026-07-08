use std::sync::{Arc, Mutex};

use ark_bdk_wallet::Wallet as ArkBdkWallet;
use ark_client::key_provider::display_receive_derivation_index;
use ark_client::{Bip32KeyProvider, InMemorySwapStorage, OfflineClient};
use ark_delegator::DelegatorClient;
use bip39::Mnemonic;
use bitcoin::XOnlyPublicKey;
use bitcoin::bip32::Xpriv;
use bitcoin::key::Secp256k1;

use crate::error::{ArkResult, ArkWasmError};
use crate::esplora_blockchain::EsploraBlockchain;
use crate::network::NetworkMode;
use crate::persistence::{
    BitboardArkPersistence, JsonPersistenceDb, OperatorSignerMigrationHint, SharedPersistenceDb,
    persisted_operator_identity_for_open, validate_operator_identity,
};

use super::mappers::{current_unix_timestamp, parse_delegator_public_key};
use super::{ArkClient, ArkSession, ArkWallet, BOLTZ_URL, CLIENT_NAME, CLIENT_TIMEOUT};

const ONCHAIN_SYNC_MAX_ATTEMPTS: u32 = 3;
const ONCHAIN_SYNC_BASE_BACKOFF_MS: u64 = 1_000;

#[cfg(target_arch = "wasm32")]
async fn sleep_for_backoff(duration: std::time::Duration) {
    bitboard_wasm_sleep::sleep_for(duration).await;
}

#[cfg(not(target_arch = "wasm32"))]
async fn sleep_for_backoff(duration: std::time::Duration) {
    tokio::time::sleep(duration).await;
}

fn is_retryable_onchain_sync_error(error: &ark_client::Error) -> bool {
    let message = error.to_string().to_lowercase();
    const RETRYABLE_PATTERNS: &[&str] = &[
        "429",
        "502",
        "503",
        "504",
        "408",
        "timeout",
        "timed out",
        "rate limit",
        "failed to fetch",
        "gateway timeout",
        "service unavailable",
        "bad gateway",
        "function_invocation_timeout",
    ];
    RETRYABLE_PATTERNS
        .iter()
        .any(|pattern| message.contains(pattern))
}

fn warn_onchain_sync_during_open(message: &str) {
    #[cfg(target_arch = "wasm32")]
    web_sys::console::warn_1(&message.into());
    #[cfg(not(target_arch = "wasm32"))]
    eprintln!("{message}");
}

/// Esplora full scan during open can fail transiently on hosted proxies; retry, then continue
/// with a stale on-chain view so session open and network switching are not blocked.
async fn sync_onchain_wallet_for_session_open(client: &ArkClient) {
    for attempt in 0..ONCHAIN_SYNC_MAX_ATTEMPTS {
        match client.sync_onchain_wallet().await {
            Ok(()) => return,
            Err(error)
                if attempt + 1 < ONCHAIN_SYNC_MAX_ATTEMPTS
                    && is_retryable_onchain_sync_error(&error) =>
            {
                warn_onchain_sync_during_open(&format!(
                    "On-chain wallet sync failed during session open (attempt {}); retrying: {error}",
                    attempt + 1
                ));
                let backoff_ms = ONCHAIN_SYNC_BASE_BACKOFF_MS.saturating_mul(1 << attempt);
                sleep_for_backoff(std::time::Duration::from_millis(backoff_ms)).await;
            }
            Err(error) => {
                warn_onchain_sync_during_open(&format!(
                    "On-chain wallet sync failed during session open; continuing with stale on-chain view: {error}"
                ));
                return;
            }
        }
    }
}

impl ArkSession {
    pub async fn open(
        mnemonic_words: &str,
        network_mode: NetworkMode,
        ark_server_url: String,
        delegator_url: String,
        esplora_url: String,
        sdk_persistence_json: Option<&str>,
    ) -> ArkResult<(Self, Option<OperatorSignerMigrationHint>)> {
        let parsed = BitboardArkPersistence::parse_import(sdk_persistence_json);
        let offchain_next_derivation_index = parsed.wallet_db.offchain_next_derivation_index;
        let network = network_mode.to_bitcoin_network();

        let wallet_db = Arc::new(JsonPersistenceDb::from_snapshot(parsed.wallet_db));
        let secp = Secp256k1::new();
        let mnemonic = Mnemonic::parse(mnemonic_words)?;
        let seed = mnemonic.to_seed("");
        let xpriv = Xpriv::new_master(network, &seed)?;

        let (delegator, delegator_xonly) = if delegator_url.trim().is_empty() {
            (None, None)
        } else {
            let delegator = DelegatorClient::new(delegator_url.clone());
            let delegator_info = delegator.info().await?;
            let delegator_pk = parse_delegator_public_key(&delegator_info.pubkey)?;
            let delegator_xonly: XOnlyPublicKey = delegator_pk.into();
            (Some(delegator), Some(delegator_xonly))
        };

        let blockchain = Arc::new(EsploraBlockchain::new(&esplora_url)?);
        let wallet = Arc::new(
            ArkBdkWallet::new_from_xpriv(
                xpriv,
                secp,
                network,
                &esplora_url,
                SharedPersistenceDb(Arc::clone(&wallet_db)),
            )
            .map_err(|error| ArkWasmError::Wallet(error.to_string()))?,
        );

        // Always Bip32KeyProvider — never StaticKeyProvider/new_with_keypair — so ark-client
        // receive peek/reveal paths use the indexed branch, not the static fallback.
        let offline = OfflineClient::<
            EsploraBlockchain,
            ArkWallet,
            InMemorySwapStorage,
            Bip32KeyProvider,
        >::new_with_bip32_at_index(
            CLIENT_NAME.to_string(),
            xpriv,
            None,
            offchain_next_derivation_index,
            blockchain,
            wallet,
            ark_server_url,
            Arc::new(InMemorySwapStorage::new()),
            BOLTZ_URL.to_string(),
            None,
            CLIENT_TIMEOUT,
            delegator_xonly,
            vec![],
        );

        let client = offline.connect().await?;
        if offchain_next_derivation_index > 0 {
            let warm_through =
                display_receive_derivation_index(offchain_next_derivation_index).saturating_add(1);
            client.warm_offchain_receive_key_cache(warm_through)?;
        }
        let server_info = client.server_info()?;
        let migration_hint = validate_operator_identity(
            parsed.operator_identity.as_ref(),
            &server_info,
            network,
            current_unix_timestamp(),
        )
        .map_err(ArkWasmError::Persistence)?;
        let server_signer: XOnlyPublicKey = server_info.signer_pk.into();
        wallet_db.set_load_context(network, server_signer);
        sync_onchain_wallet_for_session_open(&client).await;

        let operator_identity = Mutex::new(persisted_operator_identity_for_open(
            &migration_hint,
            server_signer,
            network,
        ));

        Ok((
            Self {
                client,
                wallet_db,
                delegator,
                network_mode,
                operator_identity,
            },
            migration_hint,
        ))
    }

    pub fn export_persistence(&self) -> ArkResult<String> {
        let next_index = self.client.peek_next_offchain_derivation_index();
        self.wallet_db
            .set_offchain_next_derivation_index(next_index);
        let mut wallet_db = self.wallet_db.snapshot();
        wallet_db.offchain_next_derivation_index = next_index;
        let mut envelope = BitboardArkPersistence::empty(self.persisted_operator_identity());
        envelope.wallet_db = wallet_db;
        Ok(serde_json::to_string(&envelope)?)
    }

    pub fn operator_signer_pk_hex(&self) -> String {
        self.client
            .server_info()
            .map(|server_info| server_info.signer_pk.x_only_public_key().0.to_string())
            .unwrap_or_else(|_| self.persisted_operator_identity().signer_pk_hex)
    }
}

#[cfg(test)]
mod tests {
    use super::is_retryable_onchain_sync_error;

    #[test]
    fn retryable_onchain_sync_error_detects_proxy_timeouts() {
        let error = ark_client::Error::wallet(
            "HttpResponse { status: 504, message: \"FUNCTION_INVOCATION_TIMEOUT\" }",
        );
        assert!(is_retryable_onchain_sync_error(&error));
    }

    #[test]
    fn retryable_onchain_sync_error_ignores_permanent_wallet_errors() {
        let error = ark_client::Error::wallet("Insufficient funds: need 1000 sats, have 0 sats");
        assert!(!is_retryable_onchain_sync_error(&error));
    }
}
