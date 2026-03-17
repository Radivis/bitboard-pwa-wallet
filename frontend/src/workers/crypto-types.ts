export type AddressType = 'taproot' | 'segwit';
export type BitcoinNetwork = 'bitcoin' | 'testnet' | 'signet' | 'regtest';

/** Data for a single descriptor wallet (one network + address type + account combo). Shared with db layer. */
export interface DescriptorWalletData {
  network: BitcoinNetwork;
  addressType: AddressType;
  accountId: number;
  externalDescriptor: string;
  internalDescriptor: string;
  changeSet: string;
  /** True after a full scan has been run for this sub-wallet at least once. Omitted/undefined = false for backward compat. */
  fullScanDone?: boolean;
}

/** Sensitive wallet data stored encrypted. Shared with db layer and workers. */
export interface WalletSecrets {
  mnemonic: string;
  descriptorWallets: DescriptorWalletData[];
}

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
