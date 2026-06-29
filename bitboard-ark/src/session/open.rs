use std::sync::{Arc, Mutex};

use ark_bdk_wallet::Wallet as ArkBdkWallet;
use ark_client::key_provider::display_receive_derivation_index;
use ark_client::{Bip32KeyProvider, InMemorySwapStorage, OfflineClient};
use ark_delegator::DelegatorClient;
use bip39::Mnemonic;
use bitcoin::XOnlyPublicKey;
use bitcoin::bip32::Xpriv;
use bitcoin::key::Secp256k1;
use bitcoin::secp256k1::rand::rngs::OsRng;

use crate::error::{ArkResult, ArkWasmError};
use crate::esplora_blockchain::EsploraBlockchain;
use crate::network::NetworkMode;
use crate::persistence::{
    BitboardArkPersistence, JsonPersistenceDb, OperatorSignerMigrationHint, SharedPersistenceDb,
    operator_identity_for_connected_signer, persisted_operator_identity_for_open,
    validate_operator_identity,
};

use super::mappers::{current_unix_timestamp, parse_delegator_public_key};
use super::{ArkSession, ArkWallet, BOLTZ_URL, CLIENT_NAME, CLIENT_TIMEOUT};

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
        client.sync_onchain_wallet().await?;

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

    pub async fn migrate_deprecated_signer_vtxos(&self) -> ArkResult<()> {
        self.sync_offchain_keys().await;
        let mut rng = OsRng;
        self.client
            .migrate_deprecated_signer_vtxos(&mut rng)
            .await?;
        let server_signer: XOnlyPublicKey = self.client.server_info()?.signer_pk.into();
        self.set_persisted_operator_identity(operator_identity_for_connected_signer(
            server_signer,
            self.network(),
        ));
        Ok(())
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
            .map(|server_info| {
                XOnlyPublicKey::from(server_info.signer_pk.x_only_public_key().0).to_string()
            })
            .unwrap_or_else(|_| self.persisted_operator_identity().signer_pk_hex)
    }
}
