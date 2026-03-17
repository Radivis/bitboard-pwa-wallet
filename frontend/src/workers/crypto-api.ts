import type {
  AddressType,
  BitcoinNetwork,
  BalanceInfo,
  CreateWalletResult,
  DescriptorPair,
  DescriptorWalletData,
  SyncResult,
  TransactionDetails,
} from './crypto-types';

/** Result of resolveDescriptorWallet: descriptor data and optional new encrypted blob to store. */
export interface ResolveDescriptorWalletResult {
  descriptorWalletData: DescriptorWalletData;
  encryptedBlobToStore: EncryptedBlobForDb | null;
}

/** Encrypted blob as stored in DB (transferable from worker to main). */
export interface EncryptedBlobForDb {
  ciphertext: Uint8Array;
  iv: Uint8Array;
  salt: Uint8Array;
  /** 1 = CI, 2 = production. Omitted treated as 1. */
  kdfVersion?: 1 | 2;
}

export interface CryptoService {
  /** Sets the port for worker-to-worker secrets channel. Call once from main thread before using resolveDescriptorWallet/updateDescriptorWalletChangeset. */
  setSecretsPort(port: MessagePort): Promise<void>;

  /** Lightweight health check -- resolves `true` if WASM is loaded. */
  ping(): Promise<boolean>;

  generateMnemonic(wordCount: 12 | 24): Promise<string>;
  validateMnemonic(mnemonic: string): Promise<boolean>;
  deriveDescriptors(
    mnemonic: string,
    network: BitcoinNetwork,
    addressType: AddressType,
    accountId: number
  ): Promise<DescriptorPair>;

  createWallet(
    mnemonic: string,
    network: BitcoinNetwork,
    addressType: AddressType,
    accountId: number
  ): Promise<CreateWalletResult>;
  
  loadWallet(
    externalDescriptor: string,
    internalDescriptor: string,
    network: BitcoinNetwork,
    changesetJson: string,
    useEmptyChain: boolean
  ): Promise<boolean>;

  getNewAddress(): Promise<string>;
  getCurrentAddress(): Promise<string>;
  /** Build and sign a lab transaction using BDK add_foreign_utxo. */
  buildAndSignLabTransaction(
    utxosJson: string,
    toAddress: string,
    amountSats: number,
    feeRateSatPerVb: number,
    changeAddress: string,
  ): Promise<{ signedTxHex: string; feeSats: number; hasChange: boolean }>;
  /** First internal address for lab change outputs. */
  getLabChangeAddress(): Promise<string>;
  getBalance(): Promise<BalanceInfo>;
  exportChangeset(): Promise<string>;

  syncWallet(esploraUrl: string): Promise<SyncResult>;
  fullScanWallet(esploraUrl: string, stopGap: number): Promise<SyncResult>;

  buildTransaction(
    recipientAddress: string,
    amountSats: number,
    feeRateSatPerVb: number,
    network: BitcoinNetwork
  ): Promise<string>;
  
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
    password: string,
    encryptedBlob: EncryptedBlobForDb,
    targetNetwork: BitcoinNetwork,
    targetAddressType: AddressType,
    targetAccountId: number
  ): Promise<ResolveDescriptorWalletResult>;

  /**
   * Update the changeset for one descriptor wallet in encrypted secrets.
   * Returns the new encrypted blob to store.
   */
  updateDescriptorWalletChangeset(
    password: string,
    encryptedBlob: EncryptedBlobForDb,
    network: BitcoinNetwork,
    addressType: AddressType,
    accountId: number,
    changesetJson: string
  ): Promise<EncryptedBlobForDb>;

  /**
   * Create wallet (generate mnemonic, create in WASM, encrypt secrets).
   * Returns encrypted blob, wallet result, and mnemonic for one-time backup display.
   */
  createWalletAndEncryptSecrets(
    password: string,
    network: BitcoinNetwork,
    addressType: AddressType,
    accountId: number,
    wordCount: 12 | 24
  ): Promise<{
    encryptedBlob: EncryptedBlobForDb;
    walletResult: CreateWalletResult;
    mnemonicForBackup: string;
  }>;

  /**
   * Import wallet (create in WASM from mnemonic, encrypt secrets).
   * Mnemonic is passed in and not retained; returns encrypted blob and wallet result.
   */
  importWalletAndEncryptSecrets(
    mnemonic: string,
    password: string,
    network: BitcoinNetwork,
    addressType: AddressType,
    accountId: number
  ): Promise<{
    encryptedBlob: EncryptedBlobForDb;
    walletResult: CreateWalletResult;
  }>;
}
