import { create } from 'zustand';
import {
  getCryptoWorker,
  terminateCryptoWorker,
  onWorkerHealthChange,
  type WorkerHealthStatus,
} from '@/workers/crypto-factory';
import type { Remote } from 'comlink';
import type { CryptoService } from '@/workers/crypto-api';
import type {
  AddressType,
  BitcoinNetwork,
  BalanceInfo,
  CreateWalletResult,
  DescriptorPair,
  SyncResult,
  TransactionDetails,
} from '@/workers/crypto-types';

interface CryptoState {
  _worker: Remote<CryptoService> | null;
  error: string | null;
  workerHealth: WorkerHealthStatus;
  workerError: string | null;

  _getWorker: () => Remote<CryptoService>;

  generateMnemonic: (wordCount: 12 | 24) => Promise<string>;
  validateMnemonic: (mnemonic: string) => Promise<boolean>;
  deriveDescriptors: (
    mnemonic: string,
    network: BitcoinNetwork,
    addressType: AddressType,
    accountId: number
  ) => Promise<DescriptorPair>;

  createWallet: (
    mnemonic: string,
    network: BitcoinNetwork,
    addressType: AddressType,
    accountId: number
  ) => Promise<CreateWalletResult>;
  
  loadWallet: (
    externalDescriptor: string,
    internalDescriptor: string,
    network: BitcoinNetwork,
    changesetJson: string
  ) => Promise<boolean>;

  getNewAddress: () => Promise<string>;
  getCurrentAddress: () => Promise<string>;
  buildAndSignLabTransaction: (
    utxosJson: string,
    toAddress: string,
    amountSats: number,
    feeRateSatPerVb: number,
    changeAddress: string,
  ) => Promise<{ signedTxHex: string; feeSats: number; hasChange: boolean }>;
  getLabChangeAddress: () => Promise<string>;
  getBalance: () => Promise<BalanceInfo>;
  exportChangeset: () => Promise<string>;

  syncWallet: (esploraUrl: string) => Promise<SyncResult>;
  fullScanWallet: (esploraUrl: string, stopGap: number) => Promise<SyncResult>;

  buildTransaction: (
    recipientAddress: string,
    amountSats: number,
    feeRateSatPerVb: number,
    network: BitcoinNetwork
  ) => Promise<string>;
  
  signAndExtractTransaction: (psbtBase64: string) => Promise<string>;
  
  broadcastTransaction: (
    rawTxHex: string,
    esploraUrl: string
  ) => Promise<string>;
  
  getTransactionList: () => Promise<TransactionDetails[]>;

  terminateWorker: () => void;
}

export const useCryptoStore = create<CryptoState>((set, get) => {
  const withErrorHandling = async <T,>(
    workerCall: (worker: Remote<CryptoService>) => Promise<T>
  ): Promise<T> => {
    const worker = get()._getWorker();
    try {
      set({ error: null });
      return await workerCall(worker);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      set({ error: errorMsg });
      throw err;
    }
  };

  return {
    _worker: null,
    error: null,
    workerHealth: 'initializing',
    workerError: null,

    _getWorker: () => {
      let worker = get()._worker;
      if (!worker) {
        worker = getCryptoWorker();
        set({ _worker: worker });

        onWorkerHealthChange((status, error) => {
          set({ workerHealth: status, workerError: error });
        });
      }
      return worker;
    },

    generateMnemonic: (wordCount) => 
      withErrorHandling((worker) => worker.generateMnemonic(wordCount)),

    validateMnemonic: (mnemonic) => 
      withErrorHandling((worker) => worker.validateMnemonic(mnemonic)),

    deriveDescriptors: (mnemonic, network, addressType, accountId) => 
      withErrorHandling((worker) => worker.deriveDescriptors(mnemonic, network, addressType, accountId)),

    createWallet: (mnemonic, network, addressType, accountId) => 
      withErrorHandling((worker) => worker.createWallet(mnemonic, network, addressType, accountId)),

    loadWallet: (externalDescriptor, internalDescriptor, network, changesetJson) => 
      withErrorHandling((worker) => worker.loadWallet(
        externalDescriptor,
        internalDescriptor,
        network,
        changesetJson
      )),

    getNewAddress: () => 
      withErrorHandling((worker) => worker.getNewAddress()),

    getCurrentAddress: () =>
      withErrorHandling((worker) => worker.getCurrentAddress()),

    buildAndSignLabTransaction: (
      utxosJson,
      toAddress,
      amountSats,
      feeRateSatPerVb,
      changeAddress,
    ) =>
      withErrorHandling((worker) =>
        worker.buildAndSignLabTransaction(
          utxosJson,
          toAddress,
          amountSats,
          feeRateSatPerVb,
          changeAddress,
        ),
      ),

    getLabChangeAddress: () =>
      withErrorHandling((worker) => worker.getLabChangeAddress()),

    getBalance: () =>
      withErrorHandling((worker) => worker.getBalance()),

    exportChangeset: () => 
      withErrorHandling((worker) => worker.exportChangeset()),

    syncWallet: (esploraUrl) => 
      withErrorHandling((worker) => worker.syncWallet(esploraUrl)),

    fullScanWallet: (esploraUrl, stopGap) => 
      withErrorHandling((worker) => worker.fullScanWallet(esploraUrl, stopGap)),

    buildTransaction: (recipientAddress, amountSats, feeRateSatPerVb, network) => 
      withErrorHandling((worker) => worker.buildTransaction(
        recipientAddress,
        amountSats,
        feeRateSatPerVb,
        network
      )),

    signAndExtractTransaction: (psbtBase64) => 
      withErrorHandling((worker) => worker.signAndExtractTransaction(psbtBase64)),

    broadcastTransaction: (rawTxHex, esploraUrl) => 
      withErrorHandling((worker) => worker.broadcastTransaction(rawTxHex, esploraUrl)),

    getTransactionList: () => 
      withErrorHandling((worker) => worker.getTransactionList()),

    terminateWorker: () => {
      terminateCryptoWorker();
      set({ _worker: null, error: null, workerHealth: 'initializing', workerError: null });
    },
  };
});
