import type { EncryptedBlob } from '@/lib/encrypted-blob-types';
import type {
  AddressType,
  BitcoinNetwork,
  BalanceInfo,
  CreateWalletResult,
  DescriptorPair,
  DescriptorWalletData,
  NodeInfo,
  SyncResult,
  TransactionDetails,
} from './crypto-types';

/** Result of resolveDescriptorWallet: descriptor data and optional new ciphertext(s) to store. */
export interface ResolveDescriptorWalletResult {
  descriptorWalletData: DescriptorWalletData;
  encryptedPayloadToStore: EncryptedBlobForDb | null;
  encryptedMnemonicToStore: EncryptedBlobForDb | null;
}

/** Encrypted blob as stored in DB (transferable from worker to main). */
export type EncryptedBlobForDb = EncryptedBlob;

export interface DeriveDescriptorsParams {
  mnemonic: string;
  network: BitcoinNetwork;
  addressType: AddressType;
  accountId: number;
}

export interface CreateWalletParams {
  mnemonic: string;
  network: BitcoinNetwork;
  addressType: AddressType;
  accountId: number;
}

export interface LoadWalletParams {
  externalDescriptor: string;
  internalDescriptor: string;
  network: BitcoinNetwork;
  changesetJson: string;
  useEmptyChain: boolean;
}

export interface BuildAndSignLabTransactionParams {
  utxosJson: string;
  toAddress: string;
  amountSats: number;
  feeRateSatPerVb: number;
  changeAddress: string;
}

/** Ephemeral lab-entity wallet signing (does not use the active user wallet). */
export interface LabEntityBuildAndSignLabTransactionParams {
  mnemonic: string;
  changesetJson: string;
  network: string;
  addressType: AddressType;
  accountId: number;
  utxosJson: string;
  toAddress: string;
  amountSats: number;
  feeRateSatPerVb: number;
}

export interface BuildTransactionParams {
  recipientAddress: string;
  amountSats: number;
  feeRateSatPerVb: number;
  network: BitcoinNetwork;
}

export interface ResolveDescriptorWalletParams {
  password: string;
  /** Payload ciphertext (WalletSecretsPayload JSON). */
  encryptedPayload: EncryptedBlobForDb;
  encryptedMnemonic: EncryptedBlobForDb;
  targetNetwork: BitcoinNetwork;
  targetAddressType: AddressType;
  targetAccountId: number;
}

export interface UpdateDescriptorWalletChangesetParams {
  password: string;
  /** WalletSecretsPayload ciphertext only (after split migration). */
  encryptedPayload: EncryptedBlobForDb;
  network: BitcoinNetwork;
  addressType: AddressType;
  accountId: number;
  changesetJson: string;
  markFullScanDone?: boolean;
}

export interface CreateWalletAndEncryptSecretsParams {
  password: string;
  network: BitcoinNetwork;
  addressType: AddressType;
  accountId: number;
  wordCount: 12 | 24;
}

export interface ImportWalletAndEncryptSecretsParams {
  mnemonic: string;
  password: string;
  network: BitcoinNetwork;
  addressType: AddressType;
  accountId: number;
}

export interface CryptoService {
  /** Sets the port for worker-to-worker secrets channel. Call once from main thread before using resolveDescriptorWallet/updateDescriptorWalletChangeset. */
  setSecretsPort(port: MessagePort): Promise<void>;

  /** Lightweight health check -- resolves `true` if WASM is loaded. */
  ping(): Promise<boolean>;

  generateMnemonic(wordCount: 12 | 24): Promise<string>;
  validateMnemonic(mnemonic: string): Promise<boolean>;
  deriveDescriptors(params: DeriveDescriptorsParams): Promise<DescriptorPair>;

  createWallet(params: CreateWalletParams): Promise<CreateWalletResult>;

  loadWallet(params: LoadWalletParams): Promise<boolean>;

  getNewAddress(): Promise<string>;
  getCurrentAddress(): Promise<string>;
  /** Build and sign a lab transaction using BDK add_foreign_utxo. */
  buildAndSignLabTransaction(
    params: BuildAndSignLabTransactionParams,
  ): Promise<{ signedTxHex: string; feeSats: number; hasChange: boolean }>;
  /** First internal address for lab change outputs. */
  getLabChangeAddress(): Promise<string>;

  /** Build and sign a lab mempool tx for a simulated lab entity (BDK + foreign UTXOs). */
  labEntityBuildAndSignLabTransaction(
    params: LabEntityBuildAndSignLabTransactionParams,
  ): Promise<unknown>;
  getBalance(): Promise<BalanceInfo>;
  exportChangeset(): Promise<string>;

  syncWallet(esploraUrl: string): Promise<SyncResult>;
  fullScanWallet(esploraUrl: string, stopGap: number): Promise<SyncResult>;

  buildTransaction(params: BuildTransactionParams): Promise<string>;

  signAndExtractTransaction(psbtBase64: string): Promise<string>;

  broadcastTransaction(
    rawTxHex: string,
    esploraUrl: string
  ): Promise<string>;

  getTransactionList(): Promise<TransactionDetails[]>;

  /**
   * Resolve (find or create) a descriptor wallet using encrypted secrets.
   * Decrypt and encrypt happen via the secrets port; mnemonic never leaves the worker.
   */
  resolveDescriptorWallet(
    params: ResolveDescriptorWalletParams,
  ): Promise<ResolveDescriptorWalletResult>;

  /**
   * Update the changeset for one descriptor wallet in encrypted secrets.
   * Returns the new encrypted blob to store.
   * When markFullScanDone is true, sets that sub-wallet's fullScanDone flag.
   */
  updateDescriptorWalletChangeset(
    params: UpdateDescriptorWalletChangesetParams,
  ): Promise<EncryptedBlobForDb>;

  /**
   * Create wallet (generate mnemonic, create in WASM, encrypt secrets).
   * Returns encrypted blob, wallet result, and mnemonic for one-time backup display.
   */
  createWalletAndEncryptSecrets(
    params: CreateWalletAndEncryptSecretsParams,
  ): Promise<{
    encryptedPayload: EncryptedBlobForDb;
    encryptedMnemonic: EncryptedBlobForDb;
    walletResult: CreateWalletResult;
    mnemonicForBackup: string;
  }>;

  /**
   * Import wallet (create in WASM from mnemonic, encrypt secrets).
   * Mnemonic is passed in and not retained; returns split ciphertexts and wallet result.
   */
  importWalletAndEncryptSecrets(
    params: ImportWalletAndEncryptSecretsParams,
  ): Promise<{
    encryptedPayload: EncryptedBlobForDb;
    encryptedMnemonic: EncryptedBlobForDb;
    walletResult: CreateWalletResult;
  }>;

  /** Generate a Lightning node ID from a 32-byte seed using LDK KeysManager. */
  generateNodeId(seed: Uint8Array): Promise<NodeInfo>;
}
