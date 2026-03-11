import type {
  AddressType,
  BitcoinNetwork,
  BalanceInfo,
  CreateWalletResult,
  DescriptorPair,
  SyncResult,
  TransactionDetails,
} from './crypto-types';

export interface CryptoService {
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
    changesetJson: string
  ): Promise<boolean>;

  getNewAddress(): Promise<string>;
  getCurrentAddress(): Promise<string>;
  /** Returns WIF for current address. Only valid when wallet uses regtest (lab mode). */
  getCurrentAddressWifForLab(): Promise<string>;
  /** Returns address->WIF map for lab mode multi-UTXO spending. */
  getWalletAddressesWithWifsForLab(maxExternal: number, maxInternal: number): Promise<Array<{ address: string; wif: string }>>;
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

  deriveArgon2Key(password: string, salt: Uint8Array): Promise<Uint8Array>;
}
