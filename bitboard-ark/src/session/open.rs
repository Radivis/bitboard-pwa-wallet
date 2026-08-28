use std::cell::Cell;
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
    operator_identity_for_connected_signer, persisted_operator_identity_for_open,
    validate_operator_identity,
};

use super::mappers::{current_unix_timestamp, parse_delegator_public_key};
use super::{ArkClient, ArkSession, ArkWallet, BOLTZ_URL, CLIENT_NAME, CLIENT_TIMEOUT};

const ONCHAIN_SYNC_MAX_ATTEMPTS: u32 = 3;
const ONCHAIN_SYNC_BASE_BACKOFF_MS: u64 = 1_000;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum SessionOpenConnectMode {
    LiveOperator,
    CachedOperatorInfo,
}

/// ARK-AUTO-03/04: persisted autonomous mode must not live-connect, and must fail closed
/// when cached operator info is missing.
pub(crate) fn session_open_connect_mode(
    autonomous_mode: bool,
    cached_operator_info_present: bool,
) -> ArkResult<SessionOpenConnectMode> {
    if !autonomous_mode {
        return Ok(SessionOpenConnectMode::LiveOperator);
    }
    if cached_operator_info_present {
        return Ok(SessionOpenConnectMode::CachedOperatorInfo);
    }
    Err(ArkWasmError::AutonomousOperatorInfoMissing)
}

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

/// Esplora full scan can fail transiently on hosted proxies; retry with backoff before giving up.
pub(crate) async fn sync_onchain_wallet_with_retries(client: &ArkClient) -> ArkResult<()> {
    for attempt in 0..ONCHAIN_SYNC_MAX_ATTEMPTS {
        match client.sync_onchain_wallet().await {
            Ok(()) => return Ok(()),
            Err(error)
                if attempt + 1 < ONCHAIN_SYNC_MAX_ATTEMPTS
                    && is_retryable_onchain_sync_error(&error) =>
            {
                warn_onchain_sync_during_open(&format!(
                    "On-chain wallet sync failed (attempt {}); retrying: {error}",
                    attempt + 1
                ));
                let backoff_ms = ONCHAIN_SYNC_BASE_BACKOFF_MS.saturating_mul(1 << attempt);
                sleep_for_backoff(std::time::Duration::from_millis(backoff_ms)).await;
            }
            Err(error) => return Err(ArkWasmError::Client(error)),
        }
    }
    Ok(())
}

/// Esplora full scan during open can fail transiently on hosted proxies; retry, then continue
/// with a stale on-chain view so session open and network switching are not blocked.
pub(crate) async fn sync_onchain_wallet_for_session_open(client: &ArkClient) {
    if let Err(error) = sync_onchain_wallet_with_retries(client).await {
        warn_onchain_sync_during_open(&format!(
            "On-chain wallet sync failed during session open; continuing with stale on-chain view: {error}"
        ));
    }
}

fn apply_live_operator_digest_on_open(
    wallet_db: &JsonPersistenceDb,
    live_server_info: &ark_core::server::Info,
) {
    let trust_pending = wallet_db.operator_trust_pending();
    let accepted = wallet_db.cached_operator_info();
    let digest_mismatch = crate::operator_config_diff::operator_digest_mismatch(
        accepted.as_ref(),
        &live_server_info.digest,
    );
    if trust_pending && digest_mismatch {
        wallet_db.set_pending_operator_info(
            crate::cached_operator_info::CachedOperatorInfoRecord::from_server_info(
                live_server_info,
            ),
        );
    } else if digest_mismatch && accepted.is_some() {
        wallet_db.stage_operator_trust_pending(
            crate::cached_operator_info::CachedOperatorInfoRecord::from_server_info(
                live_server_info,
            ),
        );
    } else if !digest_mismatch {
        wallet_db.set_cached_operator_info(
            crate::cached_operator_info::CachedOperatorInfoRecord::from_server_info(
                live_server_info,
            ),
        );
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
        let autonomous_mode = parsed.autonomous_mode;
        let cached_operator_info = parsed.wallet_db.cached_operator_info.clone();
        let persisted_operator_identity = parsed.operator_identity.clone();
        let offchain_next_derivation_index = parsed.wallet_db.offchain_next_derivation_index;
        let network = network_mode.to_bitcoin_network();
        let connect_mode =
            session_open_connect_mode(autonomous_mode, cached_operator_info.is_some())?;

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

        let client = match connect_mode {
            SessionOpenConnectMode::CachedOperatorInfo => {
                let cached =
                    cached_operator_info.ok_or(ArkWasmError::AutonomousOperatorInfoMissing)?;
                let server_info = cached.to_server_info()?;
                offline.connect_with_cached_info(server_info).await?
            }
            SessionOpenConnectMode::LiveOperator => offline.connect().await?,
        };
        if offchain_next_derivation_index > 0 {
            let warm_through =
                display_receive_derivation_index(offchain_next_derivation_index).saturating_add(1);
            client.warm_offchain_receive_key_cache(warm_through)?;
        }
        let server_info = client.server_info()?;
        let server_signer: XOnlyPublicKey = server_info.signer_pk.into();
        wallet_db.set_load_context(network, server_signer);
        sync_onchain_wallet_for_session_open(&client).await;

        let migration_hint = match connect_mode {
            SessionOpenConnectMode::CachedOperatorInfo => None,
            SessionOpenConnectMode::LiveOperator => {
                let hint = validate_operator_identity(
                    persisted_operator_identity.as_ref(),
                    &server_info,
                    network,
                    current_unix_timestamp(),
                )
                .map_err(ArkWasmError::Persistence)?;
                apply_live_operator_digest_on_open(&wallet_db, &server_info);
                hint
            }
        };

        let operator_identity = Mutex::new(match connect_mode {
            SessionOpenConnectMode::CachedOperatorInfo => persisted_operator_identity
                .unwrap_or_else(|| operator_identity_for_connected_signer(server_signer, network)),
            SessionOpenConnectMode::LiveOperator => {
                persisted_operator_identity_for_open(&migration_hint, server_signer, network)
            }
        });

        super::intents::install_intent_registered_hook(Arc::clone(&wallet_db));

        Ok((
            Self {
                client,
                wallet_db,
                delegator,
                network_mode,
                operator_identity,
                autonomous_mode: Cell::new(autonomous_mode),
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
        envelope.autonomous_mode = self.autonomous_mode();
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
    use super::{
        SessionOpenConnectMode, is_retryable_onchain_sync_error, session_open_connect_mode,
    };
    use crate::error::ArkWasmError;

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

    #[test]
    fn session_open_connect_mode_live_when_autonomous_off() {
        let mode = session_open_connect_mode(false, false).expect("live connect");
        assert_eq!(mode, SessionOpenConnectMode::LiveOperator);
        let mode = session_open_connect_mode(false, true).expect("live connect with cache");
        assert_eq!(mode, SessionOpenConnectMode::LiveOperator);
    }

    #[test]
    fn session_open_connect_mode_cached_when_autonomous_and_cache() {
        let mode = session_open_connect_mode(true, true).expect("cached connect");
        assert_eq!(mode, SessionOpenConnectMode::CachedOperatorInfo);
    }

    #[test]
    fn session_open_connect_mode_errors_when_autonomous_without_cache() {
        let error = session_open_connect_mode(true, false).expect_err("missing cache");
        assert!(matches!(error, ArkWasmError::AutonomousOperatorInfoMissing));
    }
}
