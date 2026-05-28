/** WASM/JSON wire shapes (snake_case). Map to domain types before app use — see `crypto-wire-mappers.ts`. */

export interface WireDescriptorPair {
  external_descriptor: string;
  internal_descriptor: string;
}

export interface WireBalanceInfo {
  confirmed_sats: number;
  trusted_pending_sats: number;
  untrusted_pending_sats: number;
  immature_sats: number;
  total_sats: number;
}

export interface WireCreateWalletResult {
  external_descriptor: string;
  internal_descriptor: string;
  first_address: string;
  changeset_json: string;
}

export interface WireSyncResult {
  balance: WireBalanceInfo;
  changeset_json: string;
}

export interface WireTransactionDetails {
  txid: string;
  sent_sats: number;
  received_sats: number;
  fee_sats: number | null;
  confirmation_block_height: number | null;
  confirmation_time: number | null;
  is_confirmed: boolean;
  is_lab_tx: boolean;
}

export interface WireReviewInputUtxo {
  address: string;
  amount_sats: number;
  txid: string;
  vout: number;
}

/** Shared unsigned send / draft PSBT fields (`LabDraftPsbtOutcome`, `PrepareOnchainSendOutcome`). */
export interface WireDraftPsbtResult {
  psbt_base64: string;
  final_amount_sats: number;
  original_amount_sats: number;
  raised_to_min_dust: boolean;
  change_free_bump_available: boolean;
  change_free_max_sats: number;
  fee_sats: number;
  change_sats: number;
  total_input_sats: number;
  input_utxos: WireReviewInputUtxo[];
}

/** `prepare_onchain_send_transaction` wire shape. */
export interface WirePrepareOnchainSendResult extends WireDraftPsbtResult {
  bumped_change_free: boolean;
}

/** `build_and_sign_lab_transaction` wire shape (`LabPrepareSendOutcome`). */
export interface WireLabSignResult {
  signed_tx_hex: string;
  fee_sats: number;
  has_change: boolean;
  final_amount_sats: number;
  original_amount_sats: number;
  raised_to_min_dust: boolean;
  bumped_change_free: boolean;
  change_free_bump_available: boolean;
  change_free_max_sats: number;
}

/** `lab_entity_build_and_sign_transaction` wire shape (`LabEntitySignResult`). */
export interface WireLabEntitySignResult extends WireLabSignResult {
  changeset_json: string;
  change_address?: string | null;
}
