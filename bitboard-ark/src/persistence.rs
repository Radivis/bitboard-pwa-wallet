use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use ark_client::Error;
use ark_client::wallet::Persistence;
use ark_core::BoardingOutput;
use bitcoin::secp256k1::Secp256k1;
use bitcoin::secp256k1::SecretKey;
use bitcoin::{Network, XOnlyPublicKey};
use serde::{Deserialize, Serialize};

pub const BITBOARD_ARK_PERSISTENCE_VERSION: u32 = 2;
pub const ARK_RS_ENGINE: &str = "ark-rs";
pub const ARK_RS_SDK_VERSION: &str = "0.9.2";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BoardingOutputSnapshot {
    pub owner_pk_hex: String,
    pub exit_delay_consensus: u32,
    pub address: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct WalletDbSnapshot {
    pub boarding_outputs: Vec<BoardingOutputSnapshot>,
    pub secret_keys_by_owner_pk_hex: HashMap<String, String>,
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

impl BitboardArkPersistenceV2 {
    pub fn empty() -> Self {
        Self {
            version: BITBOARD_ARK_PERSISTENCE_VERSION,
            engine: ARK_RS_ENGINE.to_string(),
            ark_sdk_version: ARK_RS_SDK_VERSION.to_string(),
            wallet_db: WalletDbSnapshot::default(),
            swap_storage: SwapStorageSnapshot::default(),
        }
    }

    pub fn parse_import(json: Option<&str>) -> (Self, bool) {
        let Some(raw) = json.filter(|value| !value.trim().is_empty()) else {
            return (Self::empty(), false);
        };

        let value: serde_json::Value = match serde_json::from_str(raw) {
            Ok(parsed) => parsed,
            Err(_) => return (Self::empty(), false),
        };

        if value.get("version").and_then(|v| v.as_u64()) == Some(1) {
            return (Self::empty(), true);
        }

        match serde_json::from_value::<Self>(value) {
            Ok(envelope) if envelope.version == BITBOARD_ARK_PERSISTENCE_VERSION => {
                (envelope, false)
            }
            _ => (Self::empty(), false),
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
        BoardingOutput::new(&secp, server, owner, exit_delay, network)
            .map_err(|error| Error::wallet(error.to_string()))
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
        state
            .boarding_outputs
            .iter()
            .map(|snapshot| Self::boarding_output_from_snapshot(snapshot, server, network))
            .collect()
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
