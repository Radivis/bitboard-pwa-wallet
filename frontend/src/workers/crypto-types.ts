export type {
  AddressType,
  BitcoinNetwork,
  DescriptorWalletData,
  WalletSecrets,
} from '@/lib/wallet-domain-types'

export interface DescriptorPair {
  external: string;
  internal: string;
}

export interface BalanceInfo {
  confirmed: number;
  trusted_pending: number;
  untrusted_pending: number;
  immature: number;
  total: number;
}

export interface CreateWalletResult {
  external_descriptor: string;
  internal_descriptor: string;
  first_address: string;
  changeset_json: string;
}

export interface SyncResult {
  balance: BalanceInfo;
  changeset_json: string;
}

export interface TransactionDetails {
  txid: string;
  sent_sats: number;
  received_sats: number;
  fee_sats: number | null;
  confirmation_block_height: number | null;
  /** Unix timestamp (seconds) of the block that confirmed this transaction. */
  confirmation_time: number | null;
  is_confirmed: boolean;
}
