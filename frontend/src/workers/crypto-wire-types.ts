/** WASM/JSON wire shapes (snake_case). Map to domain types before app use — see `crypto-wire-mappers.ts`. */

export interface WireDescriptorPair {
  external_descriptor: string;
  internal_descriptor: string;
}

export interface WireBalanceInfo {
  confirmed: number;
  trusted_pending: number;
  untrusted_pending: number;
  immature: number;
  total: number;
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
