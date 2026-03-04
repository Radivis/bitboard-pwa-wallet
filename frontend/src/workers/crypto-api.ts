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
  generateMnemonic(wordCount: 12 | 24): Promise<string>;
  validateMnemonic(mnemonic: string): Promise<boolean>;
  deriveDescriptors(
    mnemonic: string,
    network: BitcoinNetwork,
    addressType: AddressType
  ): Promise<DescriptorPair>;

  createWallet(
    mnemonic: string,
    network: BitcoinNetwork,
    addressType: AddressType
  ): Promise<CreateWalletResult>;
  
  loadWallet(
    externalDescriptor: string,
    internalDescriptor: string,
    network: BitcoinNetwork,
    changesetJson: string
  ): Promise<boolean>;

  getNewAddress(): Promise<string>;
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
}
