import { useMutation } from '@tanstack/react-query'
import { orchestrateArkadeSyncThenSave } from '@/lib/wallet/lifecycle/arkade-sync-lifecycle-orchestrator'
import { orchestrateLightningSyncThenSave } from '@/lib/wallet/lifecycle/lightning-sync-lifecycle-orchestrator'
import { collectLightningDashboardSyncPatches } from '@/lib/lightning/lightning-dashboard-sync'
import {
  runFullScanDashboardWalletSync,
  runIncrementalDashboardWalletSync,
} from '@/lib/wallet/wallet-utils'
import { useWalletStore } from '@/stores/walletStore'

function logOnchainManualSyncError(err: unknown): void {
  console.error('On-chain dashboard sync failed', err)
}

function logOnchainFullRescanError(err: unknown): void {
  console.error('Full rescan failed', err)
}

function logArkadeManualSyncError(err: unknown): void {
  console.error('Arkade manual sync failed', err)
}

function logLightningManualSyncError(err: unknown): void {
  console.error('Lightning manual sync failed', err)
}

export function useOnchainIncrementalSyncMutation() {
  const networkMode = useWalletStore((walletState) => walletState.networkMode)
  const activeWalletId = useWalletStore((walletState) => walletState.activeWalletId)

  return useMutation({
    mutationFn: () =>
      runIncrementalDashboardWalletSync({ networkMode, activeWalletId }),
    onError: logOnchainManualSyncError,
  })
}

export function useOnchainFullRescanSyncMutation() {
  const networkMode = useWalletStore((walletState) => walletState.networkMode)
  const activeWalletId = useWalletStore((walletState) => walletState.activeWalletId)

  return useMutation({
    mutationFn: () =>
      runFullScanDashboardWalletSync({ networkMode, activeWalletId }),
    onError: logOnchainFullRescanError,
  })
}

export function useArkadeManualSyncMutation() {
  const networkMode = useWalletStore((walletState) => walletState.networkMode)
  const activeWalletId = useWalletStore((walletState) => walletState.activeWalletId)
  const activeArkadeConnectionId = useWalletStore(
    (walletState) => walletState.activeArkadeConnectionId,
  )

  return useMutation({
    mutationFn: async () => {
      if (activeWalletId == null || activeArkadeConnectionId == null) {
        throw new Error('Arkade session is not ready')
      }
      await orchestrateArkadeSyncThenSave({
        walletId: activeWalletId,
        networkMode,
        connectionId: activeArkadeConnectionId,
        syncKind: 'manual',
        awaitCompletion: true,
        throwOnError: true,
      })
    },
    onError: logArkadeManualSyncError,
  })
}

export function useLightningManualSyncMutation() {
  const networkMode = useWalletStore((walletState) => walletState.networkMode)
  const activeWalletId = useWalletStore((walletState) => walletState.activeWalletId)

  return useMutation({
    mutationFn: async () => {
      if (activeWalletId == null) {
        throw new Error('Wallet must be unlocked')
      }
      await orchestrateLightningSyncThenSave({
        walletId: activeWalletId,
        networkMode,
        syncKind: 'manual',
        awaitCompletion: true,
        throwOnError: true,
        syncWork: collectLightningDashboardSyncPatches,
      })
    },
    onError: logLightningManualSyncError,
  })
}
