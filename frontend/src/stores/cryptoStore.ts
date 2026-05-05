import { create } from 'zustand';
import {
  getCryptoWorker,
  terminateCryptoWorker,
  onWorkerHealthChange,
  type WorkerHealthStatus,
} from '@/workers/crypto-factory';
import { removeLightningConnectionsHydrationQueries } from '@/lib/lightning-connections-hydration';
import { useWalletStore } from '@/stores/walletStore';
import { useLightningStore } from '@/stores/lightningStore';
import { useSessionStore, clearAutoLockTimer } from '@/stores/sessionStore';
import { resetSecretsChannel } from '@/workers/secrets-channel';
import { awaitInFlightWalletSecretsWrites } from '@/db/wallet-secrets-write-tracker';
import { navigateToLibraryIfOnWalletRoute } from '@/lib/app-router';
import { asBadLocalChainStateError } from '@/lib/bad-local-chain-state-error';
import type { Remote } from 'comlink';
import type {
  CryptoService,
  BuildAndSignLabTransactionParams,
  BuildAndSignLabTransactionResult,
  BuildTransactionParams,
  CreateWalletAndEncryptSecretsParams,
  CreateWalletParams,
  DeriveDescriptorsParams,
  DraftLabPsbtTransactionParams,
  DraftLabPsbtTransactionResult,
  EncryptedBlobForDb,
  ImportWalletAndEncryptSecretsParams,
  LoadWalletParams,
  PrepareOnchainSendParams,
  PrepareOnchainSendResult,
  ResolveDescriptorWalletParams,
  ResolveDescriptorWalletResult,
  UpdateDescriptorWalletChangesetParams,
} from '@/workers/crypto-api';
import type {
  BalanceInfo,
  CreateWalletResult,
  DescriptorPair,
  NodeInfo,
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
  deriveDescriptors: (params: DeriveDescriptorsParams) => Promise<DescriptorPair>;

  createWallet: (params: CreateWalletParams) => Promise<CreateWalletResult>;

  loadWallet: (params: LoadWalletParams) => Promise<boolean>;

  getNewAddress: () => Promise<string>;
  getCurrentAddress: () => Promise<string>;
  buildAndSignLabTransaction: (
    params: BuildAndSignLabTransactionParams,
  ) => Promise<BuildAndSignLabTransactionResult>;
  draftLabPsbtTransaction: (
    params: DraftLabPsbtTransactionParams,
  ) => Promise<DraftLabPsbtTransactionResult>;

  prepareOnchainSendTransaction: (
    params: PrepareOnchainSendParams,
  ) => Promise<PrepareOnchainSendResult>;
  getLabChangeAddress: () => Promise<string>;
  getBalance: () => Promise<BalanceInfo>;
  exportChangeset: () => Promise<string>;

  syncWallet: (esploraUrl: string) => Promise<SyncResult>;
  fullScanWallet: (esploraUrl: string, stopGap: number) => Promise<SyncResult>;

  buildTransaction: (params: BuildTransactionParams) => Promise<string>;

  signAndExtractTransaction: (psbtBase64: string) => Promise<string>;

  broadcastTransaction: (
    rawTxHex: string,
    esploraUrl: string
  ) => Promise<string>;

  getTransactionList: () => Promise<TransactionDetails[]>;

  resolveDescriptorWallet: (
    params: ResolveDescriptorWalletParams,
  ) => Promise<ResolveDescriptorWalletResult>;

  updateDescriptorWalletChangeset: (
    params: UpdateDescriptorWalletChangesetParams,
  ) => Promise<EncryptedBlobForDb>;

  createWalletAndEncryptSecrets: (
    params: CreateWalletAndEncryptSecretsParams,
  ) => Promise<{
    encryptedPayload: EncryptedBlobForDb;
    encryptedMnemonic: EncryptedBlobForDb;
    walletResult: CreateWalletResult;
    mnemonicForBackup: string;
  }>;

  importWalletAndEncryptSecrets: (
    params: ImportWalletAndEncryptSecretsParams,
  ) => Promise<{
    encryptedPayload: EncryptedBlobForDb;
    encryptedMnemonic: EncryptedBlobForDb;
    walletResult: CreateWalletResult;
  }>;

  generateNodeId: (seed: Uint8Array) => Promise<NodeInfo>;

  lockAndPurgeSensitiveRuntimeState: () => Promise<void>;
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

    deriveDescriptors: (params) =>
      withErrorHandling((worker) => worker.deriveDescriptors(params)),

    createWallet: (params) =>
      withErrorHandling((worker) => worker.createWallet(params)),

    loadWallet: (params) =>
      withErrorHandling((worker) => worker.loadWallet(params)),

    getNewAddress: () =>
      withErrorHandling((worker) => worker.getNewAddress()),

    getCurrentAddress: () =>
      withErrorHandling((worker) => worker.getCurrentAddress()),

    buildAndSignLabTransaction: (params) =>
      withErrorHandling((worker) => worker.buildAndSignLabTransaction(params)),

    draftLabPsbtTransaction: (params) =>
      withErrorHandling((worker) => worker.draftLabPsbtTransaction(params)),

    prepareOnchainSendTransaction: (params) =>
      withErrorHandling((worker) => worker.prepareOnchainSendTransaction(params)),

    getLabChangeAddress: () =>
      withErrorHandling((worker) => worker.getLabChangeAddress()),

    getBalance: () =>
      withErrorHandling((worker) => worker.getBalance()),

    exportChangeset: () =>
      withErrorHandling((worker) => worker.exportChangeset()),

    syncWallet: async (esploraUrl) => {
      const worker = get()._getWorker();
      try {
        set({ error: null });
        return await worker.syncWallet(esploraUrl);
      } catch (err) {
        const badLocalChainStateError = asBadLocalChainStateError(err);
        if (badLocalChainStateError) {
          set({ error: badLocalChainStateError.message });
          throw badLocalChainStateError;
        }
        const errorMsg = err instanceof Error ? err.message : String(err);
        set({ error: errorMsg });
        throw err;
      }
    },

    fullScanWallet: async (esploraUrl, stopGap) => {
      const worker = get()._getWorker();
      try {
        set({ error: null });
        return await worker.fullScanWallet(esploraUrl, stopGap);
      } catch (err) {
        const badLocalChainStateError = asBadLocalChainStateError(err);
        if (badLocalChainStateError) {
          set({ error: badLocalChainStateError.message });
          throw badLocalChainStateError;
        }
        const errorMsg = err instanceof Error ? err.message : String(err);
        set({ error: errorMsg });
        throw err;
      }
    },

    buildTransaction: (params) =>
      withErrorHandling((worker) => worker.buildTransaction(params)),

    signAndExtractTransaction: (psbtBase64) =>
      withErrorHandling((worker) => worker.signAndExtractTransaction(psbtBase64)),

    broadcastTransaction: (rawTxHex, esploraUrl) =>
      withErrorHandling((worker) => worker.broadcastTransaction(rawTxHex, esploraUrl)),

    getTransactionList: () =>
      withErrorHandling((worker) => worker.getTransactionList()),

    resolveDescriptorWallet: (params) =>
      withErrorHandling((worker) => worker.resolveDescriptorWallet(params)),

    updateDescriptorWalletChangeset: (params) =>
      withErrorHandling((worker) => worker.updateDescriptorWalletChangeset(params)),

    createWalletAndEncryptSecrets: (params) =>
      withErrorHandling((worker) => worker.createWalletAndEncryptSecrets(params)),

    importWalletAndEncryptSecrets: (params) =>
      withErrorHandling((worker) => worker.importWalletAndEncryptSecrets(params)),

    generateNodeId: (seed) =>
      withErrorHandling((worker) => worker.generateNodeId(seed)),

    lockAndPurgeSensitiveRuntimeState: async () => {
      clearAutoLockTimer();
      await awaitInFlightWalletSecretsWrites();
      navigateToLibraryIfOnWalletRoute();
      useWalletStore.getState().lockWallet();
      useLightningStore.getState().purgeLightningConnectionsFromMemory();
      removeLightningConnectionsHydrationQueries();
      terminateCryptoWorker();
      resetSecretsChannel();
      useSessionStore.getState().clear();
      set({ _worker: null, error: null, workerHealth: 'initializing', workerError: null });
    },

    terminateWorker: () => {
      terminateCryptoWorker();
      set({ _worker: null, error: null, workerHealth: 'initializing', workerError: null });
    },
  };
});
