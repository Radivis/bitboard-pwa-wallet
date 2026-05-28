export { AddressType } from '@/lib/wallet/wallet-domain-types'
export type {
  BitcoinNetwork,
  DescriptorWalletData,
  WalletSecrets,
} from '@/lib/wallet/wallet-domain-types'

/** Domain descriptor pair (camelCase). */
export interface DescriptorPair {
  externalDescriptor: string;
  internalDescriptor: string;
}

/** Domain balance from BDK/WASM (camelCase). */
export interface BalanceInfo {
  confirmed: number;
  trustedPendingSats: number;
  untrustedPendingSats: number;
  immatureSats: number;
  total: number;
}

export interface CreateWalletResult {
  externalDescriptor: string;
  internalDescriptor: string;
  firstAddress: string;
  changesetJson: string;
}

export interface SyncResult {
  balance: BalanceInfo;
  changesetJson: string;
}

/** Domain transaction row for lists and dashboard (camelCase). */
export interface TransactionDetails {
  txid: string;
  sentSats: number;
  receivedSats: number;
  feeSats: number | null;
  confirmationBlockHeight: number | null;
  /** Unix timestamp (seconds) of the block that confirmed this transaction. */
  confirmationTime: number | null;
  isConfirmed: boolean;
  /**
   * True when this row comes from lab chain history (`lab-utils`).
   * Lab `sentSats` is payment to recipients only; BDK/Esplora uses wallet input totals.
   */
  isLabTx: boolean;
}

export interface NodeInfo {
  /** Hex-encoded compressed public key (33 bytes / 66 hex chars). */
  nodeId: string;
}
