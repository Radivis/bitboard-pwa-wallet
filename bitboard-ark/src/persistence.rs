use std::collections::{BTreeMap, HashMap, HashSet};
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

/// Current on-disk Arkade persistence format (v7).
///
/// v7 stores frontend unilateral-exit job/prefs/failure on [`WalletDbSnapshot`].
/// v6 moved unilateral exit materials to a leaf-tx-keyed map on [`OffchainVtxoSnapshot`].
/// v5 and earlier import cleanly via migration in [`BitboardArkPersistence::parse_import`].
pub const BITBOARD_ARK_PERSISTENCE_VERSION: u32 = 7;
/// Legacy import version before frontend unilateral-exit bundle.
pub const LEGACY_BITBOARD_ARK_PERSISTENCE_VERSION_V6: u32 = 6;
/// Legacy import version before leaf-tx materials map.
pub const LEGACY_BITBOARD_ARK_PERSISTENCE_VERSION_V5: u32 = 5;
/// Legacy import version before operator trust pending fields.
pub const LEGACY_BITBOARD_ARK_PERSISTENCE_VERSION: u32 = 4;
/// Pre-autonomous-exit persistence format.
pub const LEGACY_BITBOARD_ARK_PERSISTENCE_VERSION_V3: u32 = 3;
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

fn ensure_unilateral_exit_frontend(
    snapshot: &mut WalletDbSnapshot,
) -> &mut UnilateralExitFrontendPersistence {
    snapshot
        .unilateral_exit_frontend
        .get_or_insert_with(UnilateralExitFrontendPersistence::default)
}

fn unix_timestamp_now() -> i64 {
    #[cfg(target_arch = "wasm32")]
    {
        (js_sys::Date::now() / 1000.0) as i64
    }
    #[cfg(not(target_arch = "wasm32"))]
    {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs() as i64
    }
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
pub struct VirtualPsbtRecord {
    pub virtual_txid: String,
    pub psbt_hex: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct UnilateralExitMaterialsRecord {
    pub cached_at: i64,
    pub chain_json: String,
    pub virtual_psbts: Vec<VirtualPsbtRecord>,
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
    #[serde(default)]
    pub unilateral_exit_materials_by_leaf_tx: BTreeMap<String, UnilateralExitMaterialsRecord>,
}

mod legacy_import {
    use super::*;

    #[derive(Debug, Clone, Deserialize)]
    pub(super) struct VirtualTxOutPointRecordV5 {
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
        #[serde(default)]
        pub spent_by: Option<String>,
        #[serde(default)]
        pub commitment_txids: Vec<String>,
        #[serde(default)]
        pub settled_by: Option<String>,
        #[serde(default)]
        pub ark_txid: Option<String>,
        #[serde(default)]
        pub assets: Vec<VirtualTxOutPointAssetRecord>,
        #[serde(default)]
        pub server_pk_hex: Option<String>,
        #[serde(default)]
        pub unilateral_exit_materials: Option<UnilateralExitMaterialsRecord>,
    }

    #[derive(Debug, Clone, Deserialize)]
    pub(super) struct OffchainVtxoSnapshotV5 {
        pub synced_at: i64,
        pub dust_sats: u64,
        pub virtual_tx_outpoints: Vec<VirtualTxOutPointRecordV5>,
    }

    #[derive(Debug, Clone, Deserialize)]
    pub(super) struct BitboardArkPersistenceV5 {
        pub version: u32,
        pub engine: String,
        pub ark_sdk_version: String,
        pub operator_identity: OperatorIdentity,
        pub wallet_db: WalletDbSnapshotV5,
        #[serde(default)]
        pub swap_storage: SwapStorageSnapshot,
    }

    #[derive(Debug, Clone, Deserialize)]
    pub(super) struct WalletDbSnapshotV5 {
        #[serde(default)]
        pub boarding_outputs: Vec<BoardingOutputSnapshot>,
        #[serde(default)]
        pub secret_keys_by_owner_pk_hex: HashMap<String, String>,
        #[serde(default)]
        pub offchain_next_derivation_index: u32,
        #[serde(default)]
        pub offchain_vtxo_snapshot: Option<OffchainVtxoSnapshotV5>,
        #[serde(default)]
        pub pending_exit_deductions: Vec<PendingExitDeductionRecord>,
        #[serde(default)]
        pub unilateral_exit_watches: Vec<UnilateralExitWatchRecord>,
        #[serde(default)]
        pub unilateral_exit_step_wait: Option<UnilateralExitStepWaitRecord>,
        #[serde(default)]
        pub cached_operator_info: Option<crate::cached_operator_info::CachedOperatorInfoRecord>,
        #[serde(default)]
        pub pending_operator_info: Option<crate::cached_operator_info::CachedOperatorInfoRecord>,
        #[serde(default)]
        pub operator_trust_pending: bool,
    }

    pub(super) fn migrate_offchain_vtxo_snapshot_v5_to_v6(
        v5: OffchainVtxoSnapshotV5,
    ) -> OffchainVtxoSnapshot {
        let mut unilateral_exit_materials_by_leaf_tx = BTreeMap::new();
        let mut virtual_tx_outpoints = Vec::with_capacity(v5.virtual_tx_outpoints.len());
        for record in v5.virtual_tx_outpoints {
            if let Some(materials) = record.unilateral_exit_materials {
                unilateral_exit_materials_by_leaf_tx
                    .entry(record.txid.clone())
                    .and_modify(|existing: &mut UnilateralExitMaterialsRecord| {
                        if materials.cached_at > existing.cached_at {
                            *existing = materials.clone();
                        }
                    })
                    .or_insert(materials);
            }
            virtual_tx_outpoints.push(VirtualTxOutPointRecord {
                txid: record.txid,
                vout: record.vout,
                created_at: record.created_at,
                expires_at: record.expires_at,
                amount_sats: record.amount_sats,
                script_hex: record.script_hex,
                is_preconfirmed: record.is_preconfirmed,
                is_swept: record.is_swept,
                is_unrolled: record.is_unrolled,
                is_spent: record.is_spent,
                spent_by: record.spent_by,
                commitment_txids: record.commitment_txids,
                settled_by: record.settled_by,
                ark_txid: record.ark_txid,
                assets: record.assets,
                server_pk_hex: record.server_pk_hex,
            });
        }
        OffchainVtxoSnapshot {
            synced_at: v5.synced_at,
            dust_sats: v5.dust_sats,
            virtual_tx_outpoints,
            unilateral_exit_materials_by_leaf_tx,
        }
    }

    pub(super) fn migrate_wallet_db_v5_to_v6(wallet_db: WalletDbSnapshotV5) -> WalletDbSnapshot {
        WalletDbSnapshot {
            boarding_outputs: wallet_db.boarding_outputs,
            secret_keys_by_owner_pk_hex: wallet_db.secret_keys_by_owner_pk_hex,
            offchain_next_derivation_index: wallet_db.offchain_next_derivation_index,
            offchain_vtxo_snapshot: wallet_db
                .offchain_vtxo_snapshot
                .map(migrate_offchain_vtxo_snapshot_v5_to_v6),
            pending_exit_deductions: wallet_db.pending_exit_deductions,
            unilateral_exit_watches: wallet_db.unilateral_exit_watches,
            unilateral_exit_step_wait: wallet_db.unilateral_exit_step_wait,
            cached_operator_info: wallet_db.cached_operator_info,
            pending_operator_info: wallet_db.pending_operator_info,
            operator_trust_pending: wallet_db.operator_trust_pending,
            pending_batch_intents: Vec::new(),
            unilateral_exit_frontend: None,
        }
    }
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

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct UnilateralExitStepWaitRecord {
    pub step_txid: String,
    pub step_index: u32,
    pub started_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct UnilateralExitLeafOutpointRecord {
    pub txid: String,
    pub vout: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct UnilateralExitJobRecord {
    #[serde(default)]
    pub selected_leaf_outpoints: Vec<UnilateralExitLeafOutpointRecord>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub current_step_relayed_since_unix: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub job_started_at_unix: Option<i64>,
}

impl UnilateralExitJobRecord {
    pub fn empty() -> Self {
        Self {
            selected_leaf_outpoints: Vec::new(),
            current_step_relayed_since_unix: None,
            job_started_at_unix: None,
        }
    }
}

impl Default for UnilateralExitJobRecord {
    fn default() -> Self {
        Self::empty()
    }
}

pub const DEFAULT_UNILATERAL_EXIT_FEE_PRESET_LABEL: &str = "Medium";
pub const DEFAULT_UNILATERAL_EXIT_MAX_FEE_RATE_SAT_PER_VB: f64 = 10.0;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct UnilateralExitAutomationPrefsRecord {
    pub enabled: bool,
    pub fee_preset_label: String,
    pub max_fee_rate_sat_per_vb: f64,
}

impl Default for UnilateralExitAutomationPrefsRecord {
    fn default() -> Self {
        Self {
            enabled: false,
            fee_preset_label: DEFAULT_UNILATERAL_EXIT_FEE_PRESET_LABEL.to_string(),
            max_fee_rate_sat_per_vb: DEFAULT_UNILATERAL_EXIT_MAX_FEE_RATE_SAT_PER_VB,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct UnilateralExitFailureRecord {
    #[serde(default)]
    pub selected_leaf_outpoints: Vec<UnilateralExitLeafOutpointRecord>,
    pub job_started_at_unix: i64,
    pub detected_at_unix: i64,
    pub reason_code: String,
    pub detail_message: String,
    #[serde(default)]
    pub vtxo_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
pub struct UnilateralExitFrontendPersistence {
    #[serde(default)]
    pub job: UnilateralExitJobRecord,
    #[serde(default)]
    pub automation_prefs: UnilateralExitAutomationPrefsRecord,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_failure: Option<UnilateralExitFailureRecord>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum PendingBatchIntentKind {
    Board,
    Recover,
    Renew,
    CollaborativeExit,
    Migrate,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct PendingBatchOutpointRecord {
    pub txid: String,
    pub vout: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct PendingBatchIntentRecord {
    pub kind: PendingBatchIntentKind,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub intent_id: Option<String>,
    #[serde(default)]
    pub onchain_outpoints: Vec<PendingBatchOutpointRecord>,
    #[serde(default)]
    pub vtxo_outpoints: Vec<PendingBatchOutpointRecord>,
    pub amount_sats: u64,
    pub registered_at: i64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub destination_address: Option<String>,
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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub unilateral_exit_step_wait: Option<UnilateralExitStepWaitRecord>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cached_operator_info: Option<crate::cached_operator_info::CachedOperatorInfoRecord>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pending_operator_info: Option<crate::cached_operator_info::CachedOperatorInfoRecord>,
    #[serde(default)]
    pub operator_trust_pending: bool,
    #[serde(default)]
    pub pending_batch_intents: Vec<PendingBatchIntentRecord>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub unilateral_exit_frontend: Option<UnilateralExitFrontendPersistence>,
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

fn is_supported_persistence_import_version(version: u32) -> bool {
    version == BITBOARD_ARK_PERSISTENCE_VERSION
        || version == LEGACY_BITBOARD_ARK_PERSISTENCE_VERSION_V6
        || version == LEGACY_BITBOARD_ARK_PERSISTENCE_VERSION_V5
        || version == LEGACY_BITBOARD_ARK_PERSISTENCE_VERSION
        || version == LEGACY_BITBOARD_ARK_PERSISTENCE_VERSION_V3
}

fn requires_v5_materials_migration(version: u32) -> bool {
    version == LEGACY_BITBOARD_ARK_PERSISTENCE_VERSION_V5
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

        let envelope: serde_json::Value = match serde_json::from_str(raw) {
            Ok(parsed) => parsed,
            Err(_) => return default_parsed_ark_persistence(),
        };

        let version = envelope
            .get("version")
            .and_then(|value| value.as_u64())
            .map(|value| value as u32);

        let Some(version) = version else {
            return default_parsed_ark_persistence();
        };

        if !is_supported_persistence_import_version(version) {
            warn_unknown_persistence_version(Some(version as u64));
            return default_parsed_ark_persistence();
        }

        if requires_v5_materials_migration(version) {
            let legacy: legacy_import::BitboardArkPersistenceV5 =
                match serde_json::from_value(envelope) {
                    Ok(parsed) => parsed,
                    Err(_) => return default_parsed_ark_persistence(),
                };
            return ParsedArkPersistence {
                wallet_db: legacy_import::migrate_wallet_db_v5_to_v6(legacy.wallet_db),
                operator_identity: Some(legacy.operator_identity),
            };
        }

        let envelope: BitboardArkPersistence = match serde_json::from_value(envelope) {
            Ok(parsed) => parsed,
            Err(_) => return default_parsed_ark_persistence(),
        };

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

    pub fn set_cached_operator_info(
        &self,
        info: crate::cached_operator_info::CachedOperatorInfoRecord,
    ) {
        lock_persistence(&self.inner).cached_operator_info = Some(info);
    }

    pub fn cached_operator_info(
        &self,
    ) -> Option<crate::cached_operator_info::CachedOperatorInfoRecord> {
        lock_persistence(&self.inner).cached_operator_info.clone()
    }

    pub fn pending_operator_info(
        &self,
    ) -> Option<crate::cached_operator_info::CachedOperatorInfoRecord> {
        lock_persistence(&self.inner).pending_operator_info.clone()
    }

    pub fn set_pending_operator_info(
        &self,
        info: crate::cached_operator_info::CachedOperatorInfoRecord,
    ) {
        lock_persistence(&self.inner).pending_operator_info = Some(info);
    }

    pub fn operator_trust_pending(&self) -> bool {
        lock_persistence(&self.inner).operator_trust_pending
    }

    pub fn stage_operator_trust_pending(
        &self,
        pending_info: crate::cached_operator_info::CachedOperatorInfoRecord,
    ) {
        let mut inner = lock_persistence(&self.inner);
        inner.pending_operator_info = Some(pending_info);
        inner.operator_trust_pending = true;
    }

    pub fn clear_operator_trust_state(&self) {
        let mut inner = lock_persistence(&self.inner);
        inner.pending_operator_info = None;
        inner.operator_trust_pending = false;
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

    pub fn pending_batch_intents(&self) -> Vec<PendingBatchIntentRecord> {
        lock_persistence(&self.inner).pending_batch_intents.clone()
    }

    pub fn set_pending_batch_intents(&self, records: Vec<PendingBatchIntentRecord>) {
        lock_persistence(&self.inner).pending_batch_intents = records;
    }

    pub fn upsert_pending_batch_intent(&self, record: PendingBatchIntentRecord) {
        let mut inner = lock_persistence(&self.inner);
        inner
            .pending_batch_intents
            .retain(|existing| !pending_batch_intents_overlap(existing, &record));
        inner.pending_batch_intents.push(record);
    }

    pub fn clear_pending_batch_intents(&self) {
        lock_persistence(&self.inner).pending_batch_intents.clear();
    }

    pub fn remove_pending_batch_intents_overlapping(
        &self,
        onchain_outpoints: &[PendingBatchOutpointRecord],
        vtxo_outpoints: &[PendingBatchOutpointRecord],
    ) {
        let mut inner = lock_persistence(&self.inner);
        inner.pending_batch_intents.retain(|existing| {
            !pending_batch_record_overlaps_outpoints(existing, onchain_outpoints, vtxo_outpoints)
        });
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

    pub fn remove_unilateral_exit_watches_for_outpoints(
        &self,
        outpoints: &HashSet<bitcoin::OutPoint>,
    ) {
        let mut inner = lock_persistence(&self.inner);
        inner.unilateral_exit_watches.retain(|watch| {
            let Ok(txid) = bitcoin::Txid::from_str(&watch.vtxo_txid) else {
                return true;
            };
            let watch_outpoint = bitcoin::OutPoint {
                txid,
                vout: watch.vout,
            };
            !outpoints.contains(&watch_outpoint)
        });
    }

    pub fn unilateral_exit_step_wait(&self) -> Option<UnilateralExitStepWaitRecord> {
        lock_persistence(&self.inner)
            .unilateral_exit_step_wait
            .clone()
    }

    /// Record when we started waiting for the current step's confirmation. Reuses `started_at` when
    /// the same step is already tracked.
    pub fn ensure_unilateral_exit_step_wait(&self, step_txid: &str, step_index: u32) -> i64 {
        let mut inner = lock_persistence(&self.inner);
        if let Some(existing) = &inner.unilateral_exit_step_wait
            && existing.step_txid == step_txid
            && existing.step_index == step_index
        {
            return existing.started_at;
        }
        let started_at = unix_timestamp_now();
        inner.unilateral_exit_step_wait = Some(UnilateralExitStepWaitRecord {
            step_txid: step_txid.to_string(),
            step_index,
            started_at,
        });
        started_at
    }

    pub fn clear_unilateral_exit_step_wait(&self) {
        lock_persistence(&self.inner).unilateral_exit_step_wait = None;
    }

    pub fn unilateral_exit_frontend(&self) -> Option<UnilateralExitFrontendPersistence> {
        lock_persistence(&self.inner)
            .unilateral_exit_frontend
            .clone()
    }

    pub fn set_unilateral_exit_frontend(&self, bundle: UnilateralExitFrontendPersistence) {
        lock_persistence(&self.inner).unilateral_exit_frontend = Some(bundle);
    }

    pub fn set_unilateral_exit_job(&self, job: UnilateralExitJobRecord) {
        let mut inner = lock_persistence(&self.inner);
        ensure_unilateral_exit_frontend(&mut inner).job = job;
    }

    pub fn set_unilateral_exit_automation_prefs(&self, prefs: UnilateralExitAutomationPrefsRecord) {
        let mut inner = lock_persistence(&self.inner);
        ensure_unilateral_exit_frontend(&mut inner).automation_prefs = prefs;
    }

    pub fn set_unilateral_exit_failure(&self, failure: Option<UnilateralExitFailureRecord>) {
        let mut inner = lock_persistence(&self.inner);
        ensure_unilateral_exit_frontend(&mut inner).last_failure = failure;
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

fn pending_batch_intents_overlap(
    left: &PendingBatchIntentRecord,
    right: &PendingBatchIntentRecord,
) -> bool {
    pending_batch_record_overlaps_outpoints(left, &right.onchain_outpoints, &right.vtxo_outpoints)
}

fn pending_batch_record_overlaps_outpoints(
    record: &PendingBatchIntentRecord,
    onchain_outpoints: &[PendingBatchOutpointRecord],
    vtxo_outpoints: &[PendingBatchOutpointRecord],
) -> bool {
    outpoint_sets_overlap(&record.onchain_outpoints, onchain_outpoints)
        || outpoint_sets_overlap(&record.vtxo_outpoints, vtxo_outpoints)
}

fn outpoint_sets_overlap(
    left: &[PendingBatchOutpointRecord],
    right: &[PendingBatchOutpointRecord],
) -> bool {
    left.iter().any(|candidate| {
        right
            .iter()
            .any(|other| candidate.txid == other.txid && candidate.vout == other.vout)
    })
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
