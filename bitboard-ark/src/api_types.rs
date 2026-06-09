use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenSessionResult {
    pub arkade_address: String,
    pub operator_signer_pk_hex: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BalanceDto {
    /// Net spendable balance (offchain + bumper, minus exits in progress).
    pub confirmed_sats: u64,
    /// Portfolio-style total: offchain (spendable + recoverable) plus confirmed on-chain bumper
    /// sats and unconfirmed boarding UTXOs. Excludes unconfirmed bumper-wallet UTXOs
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
