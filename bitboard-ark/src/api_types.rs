use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OperatorSignerMigrationHintDto {
    pub previous_signer_pk_hex: String,
    pub deprecated_status: String,
    pub cutoff_unix: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenSessionResult {
    pub arkade_address: String,
    pub operator_signer_pk_hex: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub signer_migration_hint: Option<OperatorSignerMigrationHintDto>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SignerMigrationLegResultDto {
    pub migrated_count: u32,
    pub migrated_sats: u64,
    pub deferred_count: u32,
    pub deferred_sats: u64,
    pub oversized_count: u32,
    pub oversized_sats: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub settle_txid: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SignerMigrationResultDto {
    pub vtxo_leg: SignerMigrationLegResultDto,
    pub boarding_leg: SignerMigrationLegResultDto,
    pub pass_count: u32,
    pub migration_complete: bool,
    pub pass_cap_reached: bool,
    pub remaining_pre_cutoff_vtxo_count: u32,
    pub remaining_pre_cutoff_sats: u64,
    pub remaining_pre_cutoff_boarding_count: u32,
    pub settle_txids: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BalanceDto {
    /// Net spendable balance (offchain + bumper, minus exits in progress).
    pub confirmed_sats: u64,
    /// Net spendable offchain VTXO balance only (excludes on-chain bumper and boarding).
    pub offchain_spendable_sats: u64,
    /// Confirmed on-chain bumper wallet balance (P2A fees for unilateral exit only).
    pub onchain_bumper_sats: u64,
    /// Portfolio-style total: offchain (spendable + recoverable settleable + recoverable pending
    /// operator sweep + pending recovery) plus confirmed on-chain bumper sats and unconfirmed
    /// boarding UTXOs. Excludes unconfirmed bumper-wallet UTXOs
    /// (`trusted_pending` / `untrusted_pending` from the on-chain wallet); those are not
    /// spendable for Ark operations until confirmed.
    pub total_sats: u64,
    /// On-chain boarding UTXOs confirmed and ready to settle into VTXOs.
    pub boarding_spendable_sats: u64,
    /// On-chain boarding UTXOs awaiting confirmation.
    pub boarding_pending_sats: u64,
    /// VTXOs unrolled on-chain awaiting timelock completion (unilateral exit).
    pub unilateral_exit_in_progress_sats: u64,
    /// VTXOs submitted for collaborative exit but still spendable in the last snapshot.
    pub collaborative_exit_in_progress_sats: u64,
    /// Funds locked under a deprecated operator signer past cooperative migration cutoff.
    pub pending_recovery_sats: u64,
    /// Swept or sub-dust VTXOs the user can batch-settle now.
    pub recoverable_settleable_sats: u64,
    /// Count of VTXOs in [`BalanceDto::recoverable_settleable_sats`].
    pub recoverable_settleable_vtxo_count: u32,
    /// Client-expired VTXOs awaiting operator sweep before batch settlement is safe.
    pub recoverable_pending_operator_sweep_sats: u64,
    /// Count of VTXOs in [`BalanceDto::recoverable_pending_operator_sweep_sats`].
    pub recoverable_pending_operator_sweep_vtxo_count: u32,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OperatorSyncResultDto {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub key_discovery_warning: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VtxoExpiryStatusDto {
    /// Unix seconds; earliest `expires_at` among unspent VTXOs still on the offchain path.
    pub earliest_expires_at: Option<i64>,
    /// Count of VTXOs in the renewal window (same threshold as manual renew).
    pub expiring_soon_count: u32,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DelegateInfoDto {
    pub pubkey: String,
    pub fee: u64,
    pub delegator_address: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PaymentRowDto {
    pub direction: String,
    pub amount_sats: u64,
    pub timestamp: i64,
    pub txid: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub memo: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DelegateSpendableResult {
    pub delegated: u32,
    pub failed: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_message: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FinalizePendingResult {
    pub finalized: u32,
    pub pending: u32,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExitCandidateRow {
    pub id: String,
    pub txid: String,
    pub vout: u32,
    pub amount_sats: u64,
    pub virtual_status_state: String,
    pub is_recoverable: bool,
    pub is_unrolled: bool,
    pub can_start_unroll: bool,
    pub can_complete: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OnchainBumperInfoDto {
    pub address: String,
    pub balance_sats: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub unilateral_exit_timelock_blocks: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub unilateral_exit_timelock_seconds: Option<u64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BoardingStatusDto {
    pub boarding_address: String,
    pub tracked_addresses: Vec<String>,
    pub spendable_sats: u64,
    pub pending_sats: u64,
    pub expired_sats: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IntentFeeConfiguredDto {
    pub offchain_input: bool,
    pub onchain_input: bool,
    pub offchain_output: bool,
    pub onchain_output: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CollaborativeExitFeeEstimateDto {
    pub tx_fee_rate: String,
    pub intent_fee_configured: IntentFeeConfiguredDto,
    pub estimated_total_fee_sats: Option<u64>,
    pub estimated_receive_sats: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub estimate_error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub estimate_error_code: Option<&'static str>,
}

/// [`CollaborativeExitFeeEstimateDto::estimate_error_code`] when cooperative inputs are empty
/// or otherwise insufficient for the requested exit amount.
pub const COLLABORATIVE_EXIT_ESTIMATE_ERROR_INSUFFICIENT_COOPERATIVE_INPUTS: &str =
    "insufficient_cooperative_inputs";

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecoverableVtxoFeeEstimateDto {
    pub recoverable_vtxo_count: u32,
    pub recoverable_total_sats: u64,
    pub tx_fee_rate: String,
    pub intent_fee_configured: IntentFeeConfiguredDto,
    pub estimated_total_fee_sats: Option<u64>,
    pub estimated_receive_sats: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub estimate_error: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UnilateralExitFeeEstimateDto {
    pub chain_tx_count: u32,
    pub projected_unroll_steps: u32,
    pub projected_wait_steps: u32,
    pub fee_rate_sat_per_vb: f64,
    pub estimated_package_fee_sats: u64,
    pub bumper_balance_sats: u64,
    pub bumper_sufficient: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub estimate_error: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UnrollProgressEvent {
    #[serde(rename = "type")]
    pub event_type: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub txid: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub vtxo_txid: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UnrollResult {
    pub vtxo_txid: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenSessionParams {
    pub mnemonic: String,
    pub network_mode: String,
    pub ark_server_url: String,
    pub delegator_url: String,
    pub esplora_url: String,
    #[serde(default)]
    pub sdk_persistence_json: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CollaborativeExitFeeEstimateParams {
    pub destination_address: String,
    #[serde(default)]
    pub amount_sats: Option<u64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SendPaymentParams {
    pub address: String,
    pub amount_sats: u64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CollaborativeExitParams {
    pub destination_address: String,
    pub amount_sats: Option<u64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompleteUnilateralExitParams {
    pub vtxo_txids: Vec<String>,
    pub destination_address: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UnilateralExitFeeParams {
    pub txid: String,
    pub vout: u32,
}
