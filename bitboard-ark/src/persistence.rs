use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use ark_client::Error;
use ark_client::wallet::Persistence;
use ark_core::BoardingOutput;
use bitcoin::secp256k1::Secp256k1;
use bitcoin::secp256k1::SecretKey;
use bitcoin::{Network, XOnlyPublicKey};
use serde::{Deserialize, Serialize};

pub const BITBOARD_ARK_PERSISTENCE_VERSION: u32 = 3;
pub const ARK_RS_ENGINE: &str = "ark-rs";
pub const ARK_RS_SDK_VERSION: &str = "0.9.2";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct OperatorIdentity {
    pub signer_pk_hex: String,
    pub network: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BoardingOutputSnapshot {
    pub owner_pk_hex: String,
    pub exit_delay_consensus: u32,
    pub address: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct VirtualTxOutPointAssetRecord {
    pub asset_id_hex: String,
    pub amount: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct VirtualTxOutPointRecord {
    pub txid: String,
    pub vout: u32,
    pub created_at: i64,
    pub expires_at: i64,
    pub amount_sats: u64,
    pub script_hex: String,
    pub is_preconfirmed: bool,
    pub is_swept: bool,
    pub is_unrolled: bool,
    pub is_spent: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub spent_by: Option<String>,
    pub commitment_txids: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub settled_by: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ark_txid: Option<String>,
    #[serde(default)]
    pub assets: Vec<VirtualTxOutPointAssetRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct OffchainVtxoSnapshot {
    pub synced_at: i64,
    pub dust_sats: u64,
    pub virtual_tx_outpoints: Vec<VirtualTxOutPointRecord>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct WalletDbSnapshot {
    pub boarding_outputs: Vec<BoardingOutputSnapshot>,
    pub secret_keys_by_owner_pk_hex: HashMap<String, String>,
    #[serde(default)]
    pub offchain_next_derivation_index: u32,
    #[serde(default)]
    pub offchain_vtxo_snapshot: Option<OffchainVtxoSnapshot>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct SwapStorageSnapshot {}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BitboardArkPersistenceV2 {
    pub version: u32,
    pub engine: String,
    pub ark_sdk_version: String,
    pub wallet_db: WalletDbSnapshot,
    pub swap_storage: SwapStorageSnapshot,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BitboardArkPersistenceV3 {
    pub version: u32,
    pub engine: String,
    pub ark_sdk_version: String,
    pub operator_identity: OperatorIdentity,
    pub wallet_db: WalletDbSnapshot,
    pub swap_storage: SwapStorageSnapshot,
}

pub struct ParsedArkPersistence {
    pub wallet_db: WalletDbSnapshot,
    pub operator_identity: Option<OperatorIdentity>,
    pub reset_v1: bool,
}

impl BitboardArkPersistenceV3 {
    pub fn empty(operator_identity: OperatorIdentity) -> Self {
        Self {
            version: BITBOARD_ARK_PERSISTENCE_VERSION,
            engine: ARK_RS_ENGINE.to_string(),
            ark_sdk_version: ARK_RS_SDK_VERSION.to_string(),
            operator_identity,
            wallet_db: WalletDbSnapshot::default(),
            swap_storage: SwapStorageSnapshot::default(),
        }
    }

    pub fn parse_import(json: Option<&str>) -> ParsedArkPersistence {
        let Some(raw) = json.filter(|value| !value.trim().is_empty()) else {
            return ParsedArkPersistence {
                wallet_db: WalletDbSnapshot::default(),
                operator_identity: None,
                reset_v1: false,
            };
        };

        let value: serde_json::Value = match serde_json::from_str(raw) {
            Ok(parsed) => parsed,
            Err(_) => {
                return ParsedArkPersistence {
                    wallet_db: WalletDbSnapshot::default(),
                    operator_identity: None,
                    reset_v1: false,
                };
            }
        };

        if value.get("version").and_then(|v| v.as_u64()) == Some(1) {
            return ParsedArkPersistence {
                wallet_db: WalletDbSnapshot::default(),
                operator_identity: None,
                reset_v1: true,
            };
        }

        if let Ok(envelope) = serde_json::from_value::<BitboardArkPersistenceV3>(value.clone()) {
            if envelope.version == BITBOARD_ARK_PERSISTENCE_VERSION {
                return ParsedArkPersistence {
                    wallet_db: envelope.wallet_db,
                    operator_identity: Some(envelope.operator_identity),
                    reset_v1: false,
                };
            }
        }

        if let Ok(envelope) = serde_json::from_value::<BitboardArkPersistenceV2>(value) {
            if envelope.version == 2 {
                return ParsedArkPersistence {
                    wallet_db: envelope.wallet_db,
                    operator_identity: None,
                    reset_v1: false,
                };
            }
        }

        ParsedArkPersistence {
            wallet_db: WalletDbSnapshot::default(),
            operator_identity: None,
            reset_v1: false,
        }
    }
}

impl BitboardArkPersistenceV2 {
    pub fn empty() -> Self {
        Self {
            version: 2,
            engine: ARK_RS_ENGINE.to_string(),
            ark_sdk_version: ARK_RS_SDK_VERSION.to_string(),
            wallet_db: WalletDbSnapshot::default(),
            swap_storage: SwapStorageSnapshot::default(),
        }
    }
}

#[derive(Default)]
pub struct JsonPersistenceDb {
    inner: Mutex<WalletDbSnapshot>,
    load_context: Mutex<Option<(Network, XOnlyPublicKey)>>,
}

impl JsonPersistenceDb {
    pub fn from_snapshot(snapshot: WalletDbSnapshot) -> Self {
        Self {
            inner: Mutex::new(snapshot),
            load_context: Mutex::new(None),
        }
    }

    pub fn set_load_context(&self, network: Network, server_signer: XOnlyPublicKey) {
        *self.load_context.lock().expect("persistence lock") = Some((network, server_signer));
    }

    pub fn snapshot(&self) -> WalletDbSnapshot {
        self.inner.lock().expect("persistence lock").clone()
    }

    pub fn set_offchain_vtxo_snapshot(&self, snapshot: OffchainVtxoSnapshot) {
        self.inner
            .lock()
            .expect("persistence lock")
            .offchain_vtxo_snapshot = Some(snapshot);
    }

    pub fn boarding_output_to_snapshot(boarding_output: &BoardingOutput) -> BoardingOutputSnapshot {
        BoardingOutputSnapshot {
            owner_pk_hex: boarding_output.owner_pk().to_string(),
            exit_delay_consensus: boarding_output.exit_delay().to_consensus_u32(),
            address: boarding_output.address().to_string(),
        }
    }

    pub fn boarding_output_from_snapshot(
        snapshot: &BoardingOutputSnapshot,
        server: XOnlyPublicKey,
        network: Network,
    ) -> Result<BoardingOutput, Error> {
        let secp = Secp256k1::new();
        let owner: XOnlyPublicKey = snapshot
            .owner_pk_hex
            .parse()
            .map_err(|error| Error::wallet(format!("invalid owner pk: {error}")))?;
        let exit_delay = bitcoin::Sequence::from_consensus(snapshot.exit_delay_consensus);
        let boarding_output = BoardingOutput::new(&secp, server, owner, exit_delay, network)
            .map_err(|error| Error::wallet(error.to_string()))?;
        if boarding_output.address().to_string() != snapshot.address {
            return Err(Error::wallet(format!(
                "boarding output address mismatch for {}: persisted {} but reconstructed {}",
                snapshot.owner_pk_hex,
                snapshot.address,
                boarding_output.address(),
            )));
        }
        Ok(boarding_output)
    }
}

/// Shared handle so `ark-bdk-wallet` and persistence export use the same DB.
#[derive(Clone, Default)]
pub struct SharedPersistenceDb(pub Arc<JsonPersistenceDb>);

impl Persistence for SharedPersistenceDb {
    fn save_boarding_output(
        &self,
        sk: SecretKey,
        boarding_output: BoardingOutput,
    ) -> Result<(), Error> {
        self.0.save_boarding_output(sk, boarding_output)
    }

    fn load_boarding_outputs(&self) -> Result<Vec<BoardingOutput>, Error> {
        self.0.load_boarding_outputs()
    }

    fn sk_for_pk(&self, pk: &XOnlyPublicKey) -> Result<SecretKey, Error> {
        self.0.sk_for_pk(pk)
    }
}

impl Persistence for JsonPersistenceDb {
    fn save_boarding_output(
        &self,
        sk: SecretKey,
        boarding_output: BoardingOutput,
    ) -> Result<(), Error> {
        let owner_pk = boarding_output.owner_pk();
        let snapshot = Self::boarding_output_to_snapshot(&boarding_output);
        let mut state = self.inner.lock().expect("persistence lock");
        state
            .secret_keys_by_owner_pk_hex
            .insert(owner_pk.to_string(), hex::encode(sk.secret_bytes()));
        if !state
            .boarding_outputs
            .iter()
            .any(|row| row.address == snapshot.address)
        {
            state.boarding_outputs.push(snapshot);
        }
        Ok(())
    }

    fn load_boarding_outputs(&self) -> Result<Vec<BoardingOutput>, Error> {
        let state = self.inner.lock().expect("persistence lock");
        let (network, server) = self
            .load_context
            .lock()
            .expect("persistence lock")
            .ok_or_else(|| Error::wallet("boarding load context not configured"))?;
        Ok(state
            .boarding_outputs
            .iter()
            .filter_map(|snapshot| {
                Self::boarding_output_from_snapshot(snapshot, server, network).ok()
            })
            .collect())
    }

    fn sk_for_pk(&self, pk: &XOnlyPublicKey) -> Result<SecretKey, Error> {
        let state = self.inner.lock().expect("persistence lock");
        let hex_sk = state
            .secret_keys_by_owner_pk_hex
            .get(&pk.to_string())
            .ok_or_else(|| Error::wallet(format!("no secret key for pk {pk}")))?;
        let bytes = hex::decode(hex_sk).map_err(|error| Error::wallet(error.to_string()))?;
        SecretKey::from_slice(&bytes).map_err(|error| Error::wallet(error.to_string()))
    }
}

pub fn network_label(network: Network) -> String {
    match network {
        Network::Bitcoin => "bitcoin".to_string(),
        Network::Testnet => "testnet".to_string(),
        Network::Signet => "signet".to_string(),
        Network::Regtest => "regtest".to_string(),
        _ => "unknown".to_string(),
    }
}

pub fn validate_operator_identity(
    stored: Option<&OperatorIdentity>,
    connected_signer: XOnlyPublicKey,
    network: Network,
) -> Result<(), String> {
    let Some(stored) = stored else {
        return Ok(());
    };
    let connected_hex = connected_signer.to_string();
    if stored.signer_pk_hex != connected_hex {
        return Err(format!(
            "sdkPersistenceJson operator signer {} does not match connected operator {connected_hex}",
            stored.signer_pk_hex
        ));
    }
    if stored.network != network_label(network) {
        return Err(format!(
            "sdkPersistenceJson network {} does not match session network {}",
            stored.network,
            network_label(network)
        ));
    }
    Ok(())
}
