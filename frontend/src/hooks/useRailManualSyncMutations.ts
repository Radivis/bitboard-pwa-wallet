import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { orchestrateArkadeSyncThenSave } from '@/lib/wallet/lifecycle/arkade-sync-lifecycle-orchestrator'
import { orchestrateLightningSyncThenSave } from '@/lib/wallet/lifecycle/lightning-sync-lifecycle-orchestrator'
import { collectLightningDashboardSyncPatches } from '@/lib/lightning/lightning-dashboard-sync'
import { syncArkadeWithOperator } from '@/lib/arkade/arkade-operator-sync'
import {
  runFullScanDashboardWalletSync,
  runIncrementalDashboardWalletSync,
} from '@/lib/wallet/wallet-utils'
import { BadLocalChainStateError } from '@/lib/shared/bad-local-chain-state-error'
import { sanitizeErrorMessageForUi } from '@/lib/shared/sanitize-error-for-ui'
import { errorMessage } from '@/lib/shared/utils'
import { useWalletStore, type NetworkMode } from '@/stores/walletStore'

function reportOnchainSyncError(err: unknown): void {
  console.error('On-chain dashboard sync failed', err)
  if (err instanceof BadLocalChainStateError) {
    toast.error('Sync failed', { description: err.message })
    return
  }
  const detail = sanitizeErrorMessageForUi(errorMessage(err))
  toast.error(detail || 'Sync failed')
}

function reportOnchainFullRescanError(err: unknown): void {
  console.error('Full rescan failed', err)
  const detail = sanitizeErrorMessageForUi(errorMessage(err))
  toast.error(detail || 'Full rescan failed')
}

export function useOnchainIncrementalSyncMutation() {
  const networkMode = useWalletStore((walletState) => walletState.networkMode)
  const activeWalletId = useWalletStore((walletState) => walletState.activeWalletId)

  return useMutation({
    mutationFn: () =>
      runIncrementalDashboardWalletSync({ networkMode, activeWalletId }),
    onError: reportOnchainSyncError,
  })
}

export function useOnchainFullRescanSyncMutation() {
  const networkMode = useWalletStore((walletState) => walletState.networkMode)
  const activeWalletId = useWalletStore((walletState) => walletState.activeWalletId)

  return useMutation({
    mutationFn: () =>
      runFullScanDashboardWalletSync({ networkMode, activeWalletId }),
    onError: reportOnchainFullRescanError,
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
      await syncArkadeWithOperator({
        walletId: activeWalletId,
        networkMode,
        connectionId: activeArkadeConnectionId,
      })
    },
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
    onError: (err) => {
      toast.error(sanitizeErrorMessageForUi(errorMessage(err)) || 'Lightning sync failed')
    },
  })
}

/** @internal Exported for tests that assert per-rail isolation. */
export async function runArkadeManualSyncForWallet(params: {
  walletId: number
  networkMode: NetworkMode
  connectionId: string
}): Promise<void> {
  await orchestrateArkadeSyncThenSave({
    ...params,
    syncKind: 'manual',
    awaitCompletion: true,
    throwOnError: true,
  })
}
