use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};

use ark_client::Error;
use ark_client::wallet::Persistence;
use ark_core::BoardingOutput;
use ark_core::server::{DeprecatedSignerStatus, Info, ServerSignerStatus};
use bitcoin::secp256k1::Secp256k1;
use bitcoin::secp256k1::SecretKey;
use bitcoin::{Network, XOnlyPublicKey};
use serde::{Deserialize, Serialize};
use std::str::FromStr;

/// Current on-disk Arkade persistence format (v3).
///
/// Versions 1 and 2 were pre-production prototypes only; no production wallets shipped those
/// blobs. Unknown versions are rejected in [`BitboardArkPersistence::parse_import`] and import
/// starts from an empty `wallet_db`.
pub const BITBOARD_ARK_PERSISTENCE_VERSION: u32 = 3;
const PERSISTENCE_LOCK_POISONED: &str = "persistence lock poisoned";

/// Single-threaded WASM: recover in-memory state after a prior panic instead of re-panicking.
fn lock_persistence<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(|poisoned: PoisonError<_>| poisoned.into_inner())
}

fn lock_persistence_result<T>(mutex: &Mutex<T>) -> Result<MutexGuard<'_, T>, Error> {
    mutex
        .lock()
        .map_err(|_| Error::wallet(PERSISTENCE_LOCK_POISONED))
}
pub const ARK_RS_ENGINE: &str = "ark-rs";
pub const ARK_RS_SDK_VERSION: &str = "0.9.3";

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
    /// Operator signer public key for this VTXO's tapscript (x-only hex). Used to replay signer-aware
    /// balance buckets from a local snapshot without calling the operator.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub server_pk_hex: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct OffchainVtxoSnapshot {
    pub synced_at: i64,
    pub dust_sats: u64,
    pub virtual_tx_outpoints: Vec<VirtualTxOutPointRecord>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum PendingExitKind {
    Unilateral,
    Collaborative,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct PendingExitDeductionRecord {
    pub kind: PendingExitKind,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub vtxo_txid: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub vout: Option<u32>,
    pub amount_sats: u64,
    pub started_at: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub baseline_offchain_spendable_sats: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct UnilateralExitWatchRecord {
    pub vtxo_txid: String,
    pub vout: u32,
    pub amount_sats: u64,
    pub registered_at: i64,
    /// Tip txid from unroll (for Esplora branch checks).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub published_vtxo_txid: Option<String>,
    #[serde(default)]
    pub branch_txids: Vec<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct WalletDbSnapshot {
    pub boarding_outputs: Vec<BoardingOutputSnapshot>,
    pub secret_keys_by_owner_pk_hex: HashMap<String, String>,
    #[serde(default)]
    pub offchain_next_derivation_index: u32,
    #[serde(default)]
    pub offchain_vtxo_snapshot: Option<OffchainVtxoSnapshot>,
    #[serde(default)]
    pub pending_exit_deductions: Vec<PendingExitDeductionRecord>,
    #[serde(default)]
    pub unilateral_exit_watches: Vec<UnilateralExitWatchRecord>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct SwapStorageSnapshot {}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BitboardArkPersistence {
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
}

fn default_parsed_ark_persistence() -> ParsedArkPersistence {
    ParsedArkPersistence {
        wallet_db: WalletDbSnapshot::default(),
        operator_identity: None,
    }
}

fn warn_unknown_persistence_version(version: Option<u64>) {
    let message = format!(
        "Ignoring unsupported Arkade persistence version {:?} (v1/v2 were pre-production prototypes only); starting from empty wallet_db",
        version
    );
    #[cfg(target_arch = "wasm32")]
    web_sys::console::warn_1(&message.into());
    #[cfg(not(target_arch = "wasm32"))]
    eprintln!("{message}");
}

impl BitboardArkPersistence {
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
            return default_parsed_ark_persistence();
        };

        let envelope: BitboardArkPersistence = match serde_json::from_str(raw) {
            Ok(parsed) => parsed,
            Err(_) => return default_parsed_ark_persistence(),
        };

        if envelope.version != BITBOARD_ARK_PERSISTENCE_VERSION {
            warn_unknown_persistence_version(Some(envelope.version as u64));
            return default_parsed_ark_persistence();
        }

        ParsedArkPersistence {
            wallet_db: envelope.wallet_db,
            operator_identity: Some(envelope.operator_identity),
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
        *lock_persistence(&self.load_context) = Some((network, server_signer));
    }

    pub fn snapshot(&self) -> WalletDbSnapshot {
        lock_persistence(&self.inner).clone()
    }

    pub fn set_offchain_vtxo_snapshot(&self, snapshot: OffchainVtxoSnapshot) {
        lock_persistence(&self.inner).offchain_vtxo_snapshot = Some(snapshot);
    }

    pub fn set_offchain_next_derivation_index(&self, index: u32) {
        lock_persistence(&self.inner).offchain_next_derivation_index = index;
    }

    pub fn pending_exit_deductions(&self) -> Vec<PendingExitDeductionRecord> {
        lock_persistence(&self.inner)
            .pending_exit_deductions
            .clone()
    }

    pub fn set_pending_exit_deductions(&self, records: Vec<PendingExitDeductionRecord>) {
        lock_persistence(&self.inner).pending_exit_deductions = records;
    }

    pub fn unilateral_exit_watches(&self) -> Vec<UnilateralExitWatchRecord> {
        lock_persistence(&self.inner)
            .unilateral_exit_watches
            .clone()
    }

    pub fn set_unilateral_exit_watches(&self, watches: Vec<UnilateralExitWatchRecord>) {
        lock_persistence(&self.inner).unilateral_exit_watches = watches;
    }

    pub fn upsert_unilateral_exit_watch(&self, record: UnilateralExitWatchRecord) {
        let mut inner = lock_persistence(&self.inner);
        if let Some(existing) = inner
            .unilateral_exit_watches
            .iter_mut()
            .find(|existing| existing.vtxo_txid == record.vtxo_txid && existing.vout == record.vout)
        {
            if record.published_vtxo_txid.is_some() {
                existing.published_vtxo_txid = record.published_vtxo_txid;
            }
            if !record.branch_txids.is_empty() {
                existing.branch_txids = record.branch_txids;
            }
            existing.amount_sats = record.amount_sats;
            return;
        }
        inner.unilateral_exit_watches.push(record);
    }

    pub fn remove_unilateral_exit_watch(&self, txid: &str, vout: u32) {
        let mut inner = lock_persistence(&self.inner);
        inner
            .unilateral_exit_watches
            .retain(|watch| !(watch.vtxo_txid == txid && watch.vout == vout));
    }

    pub fn remove_unilateral_exit_watches_for_txids(&self, vtxo_txids: &HashSet<String>) {
        let mut inner = lock_persistence(&self.inner);
        inner
            .unilateral_exit_watches
            .retain(|watch| !vtxo_txids.contains(&watch.vtxo_txid));
    }

    /// Insert or replace a pending exit record (no duplicate deductions on retry).
    pub fn upsert_pending_exit_deduction(&self, record: PendingExitDeductionRecord) {
        let mut inner = lock_persistence(&self.inner);
        match record.kind {
            PendingExitKind::Unilateral => {
                let Some(txid) = record.vtxo_txid.as_deref() else {
                    inner.pending_exit_deductions.push(record);
                    return;
                };
                let vout = record.vout.unwrap_or(0);
                if let Some(existing) = inner.pending_exit_deductions.iter_mut().find(|existing| {
                    existing.kind == PendingExitKind::Unilateral
                        && existing.vtxo_txid.as_deref() == Some(txid)
                        && existing.vout.unwrap_or(0) == vout
                }) {
                    *existing = record;
                    return;
                }
                inner.pending_exit_deductions.push(record);
            }
            PendingExitKind::Collaborative => {
                inner
                    .pending_exit_deductions
                    .retain(|existing| existing.kind != PendingExitKind::Collaborative);
                inner.pending_exit_deductions.push(record);
            }
        }
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
        let mut state = lock_persistence_result(&self.inner)?;
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
        let state = lock_persistence_result(&self.inner)?;
        let (network, server) = lock_persistence_result(&self.load_context)?
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
        let state = lock_persistence_result(&self.inner)?;
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

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct OperatorSignerMigrationHint {
    pub previous_signer_pk_hex: String,
    pub deprecated_status: String,
    pub cutoff_unix: i64,
}

fn deprecated_status_label(status: DeprecatedSignerStatus) -> &'static str {
    match status {
        DeprecatedSignerStatus::Migratable => "migratable",
        DeprecatedSignerStatus::DueNow => "due_now",
        DeprecatedSignerStatus::Expired => "expired",
    }
}

fn cutoff_unix_for_deprecated_signer(server_info: &Info, stored_signer: XOnlyPublicKey) -> i64 {
    server_info
        .deprecated_signers
        .iter()
        .find(|deprecated| deprecated.pk.x_only_public_key().0 == stored_signer)
        .map(|deprecated| deprecated.cutoff_date)
        .unwrap_or(0)
}

pub fn operator_identity_for_connected_signer(
    connected_signer: XOnlyPublicKey,
    network: Network,
) -> OperatorIdentity {
    OperatorIdentity {
        signer_pk_hex: connected_signer.to_string(),
        network: network_label(network),
    }
}

/// Operator identity written into SDK persistence on export.
///
/// While a signer rotation migration is pending, keep the deprecated stored signer so later opens
/// still surface a migration hint until cooperative migration completes.
pub fn persisted_operator_identity_for_open(
    migration_hint: &Option<OperatorSignerMigrationHint>,
    connected_signer: XOnlyPublicKey,
    network: Network,
) -> OperatorIdentity {
    if let Some(hint) = migration_hint {
        return OperatorIdentity {
            signer_pk_hex: hint.previous_signer_pk_hex.clone(),
            network: network_label(network),
        };
    }

    operator_identity_for_connected_signer(connected_signer, network)
}

pub fn validate_operator_identity(
    stored: Option<&OperatorIdentity>,
    connected_server_info: &Info,
    network: Network,
    now_unix_secs: i64,
) -> Result<Option<OperatorSignerMigrationHint>, String> {
    let Some(stored) = stored else {
        return Ok(None);
    };

    if stored.network != network_label(network) {
        return Err(format!(
            "sdkPersistenceJson network {} does not match session network {}",
            stored.network,
            network_label(network)
        ));
    }

    let stored_signer = XOnlyPublicKey::from_str(&stored.signer_pk_hex).map_err(|error| {
        format!("sdkPersistenceJson operator signer is not a valid x-only public key: {error}")
    })?;

    let connected_signer = connected_server_info.signer_pk.x_only_public_key().0;
    let connected_hex = connected_signer.to_string();

    match connected_server_info.signer_status_at(stored_signer, now_unix_secs) {
        ServerSignerStatus::Current => Ok(None),
        ServerSignerStatus::Deprecated(status) => Ok(Some(OperatorSignerMigrationHint {
            previous_signer_pk_hex: stored.signer_pk_hex.clone(),
            deprecated_status: deprecated_status_label(status).to_string(),
            cutoff_unix: cutoff_unix_for_deprecated_signer(connected_server_info, stored_signer),
        })),
        ServerSignerStatus::Unknown => Err(format!(
            "sdkPersistenceJson operator signer {} is not recognized by the connected operator (current signer {connected_hex}). \
             This usually means a different Arkade service provider, not a routine operator key rotation.",
            stored.signer_pk_hex
        )),
    }
}
