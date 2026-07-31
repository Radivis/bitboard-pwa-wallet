import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  ESPLORA_FEE_PRESETS_QUERY_KEY,
  presetRatesForNetwork,
} from '@/hooks/useEsploraFeePresets'
import { isArkadeSupportedNetworkMode } from '@/lib/arkade/arkade-endpoints'
import {
  arkadeBalanceQueryKey,
  arkadeUnilateralExitProgressQueryKey,
  arkadeUnilateralExitTopologyScopeKey,
} from '@/lib/arkade/arkade-query-keys'
import { isArkadeActiveForNetworkMode } from '@/lib/arkade/arkade-utils'
import { proceedUnilateralExitStepWithGuards } from '@/lib/arkade/proceed-unilateral-exit-step'
import { resolveAutomatedStepFeeRateSatPerVb } from '@/lib/arkade/unilateral-exit-automation-fees'
import { getArkadeLoadLifecycleSnapshot } from '@/lib/wallet/lifecycle/arkade-load-lifecycle-orchestrator'
import { walletIsUnlockedOrSyncing } from '@/lib/wallet/wallet-unlocked-status'
import { selectCommittedNetworkMode, useWalletStore } from '@/stores/walletStore'
import {
  unilateralExitAutomationJobKey,
  useUnilateralExitAutomationStore,
} from '@/stores/unilateralExitAutomationStore'
import { useUnilateralExitControlStore } from '@/stores/unilateralExitControlStore'
import { usePersistedStoreHydrated } from '@/hooks/usePersistedStoreHydrated'
import { getArkadeWorker } from '@/workers/arkade-factory'
import { sortArkadeVtxoOutpoints } from '@/workers/arkade-api'

function pauseReasonToastMessage(
  pausedReason: 'feeCapExceeded' | 'bumperInsufficient' | 'error',
  lastErrorMessage?: string,
): string {
  switch (pausedReason) {
    case 'feeCapExceeded':
      return 'Automatic unilateral exit paused: Live fee rate exceeds your maximum.'
    case 'bumperInsufficient':
      return 'Automatic unilateral exit paused: Insufficient bumper balance.'
    case 'error':
      return lastErrorMessage ?? 'Automatic unilateral exit paused due to an error.'
  }
}

async function invalidateUnilateralExitQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  walletId: number,
  networkMode: ReturnType<typeof selectCommittedNetworkMode>,
  arkadeConnectionId: string,
  vtxoOutpoints: ReturnType<typeof sortArkadeVtxoOutpoints>,
): Promise<void> {
  if (!isArkadeSupportedNetworkMode(networkMode)) return
  const sortedOutpoints = sortArkadeVtxoOutpoints(vtxoOutpoints)
  await queryClient.invalidateQueries({
    queryKey: arkadeUnilateralExitProgressQueryKey(
      walletId,
      networkMode,
      arkadeConnectionId,
      sortedOutpoints,
    ),
  })
  await queryClient.invalidateQueries({
    queryKey: arkadeBalanceQueryKey(walletId, networkMode, arkadeConnectionId),
  })
  await queryClient.invalidateQueries({
    queryKey: arkadeUnilateralExitTopologyScopeKey(
      walletId,
      networkMode,
      arkadeConnectionId,
    ),
  })
}

export function useUnilateralExitAutomationRunner() {
  const queryClient = useQueryClient()
  const activeWalletId = useWalletStore((state) => state.activeWalletId)
  const activeArkadeConnectionId = useWalletStore((state) => state.activeArkadeConnectionId)
  const networkMode = useWalletStore(selectCommittedNetworkMode)
  const walletStatus = useWalletStore((state) => state.walletStatus)

  const automationJob = useUnilateralExitAutomationStore((state) => {
    if (
      activeWalletId == null ||
      activeArkadeConnectionId == null ||
      !isArkadeSupportedNetworkMode(networkMode)
    ) {
      return null
    }
    const key = unilateralExitAutomationJobKey(
      activeWalletId,
      networkMode,
      activeArkadeConnectionId,
    )
    return state.jobsByKey[key] ?? null
  })

  const automationStoreHydrated = usePersistedStoreHydrated(useUnilateralExitAutomationStore)

  const runnerGenerationRef = useRef(0)

  useEffect(() => {
    const walletUnlocked = walletIsUnlockedOrSyncing(walletStatus)
    const shouldRun =
      automationStoreHydrated &&
      walletUnlocked &&
      activeWalletId != null &&
      activeArkadeConnectionId != null &&
      isArkadeActiveForNetworkMode(networkMode) &&
      isArkadeSupportedNetworkMode(networkMode) &&
      automationJob != null &&
      automationJob.proceedAutomatically &&
      automationJob.jobStarted &&
      automationJob.pausedReason == null &&
      automationJob.selectedLeafOutpoints.length > 0

    if (!shouldRun) {
      return
    }

    const runnerGeneration = ++runnerGenerationRef.current
    let cancelled = false

    const isStale = () => cancelled || runnerGeneration !== runnerGenerationRef.current

    async function runAutomationLoop(): Promise<void> {
      while (!isStale()) {
          const store = useUnilateralExitAutomationStore.getState()
          const job = store.getJob(activeWalletId!, networkMode, activeArkadeConnectionId!)
          if (
            !job.proceedAutomatically ||
            !job.jobStarted ||
            job.pausedReason != null ||
            job.selectedLeafOutpoints.length === 0
          ) {
            return
          }

          if (!walletIsUnlockedOrSyncing(useWalletStore.getState().walletStatus)) {
            return
          }

          if (getArkadeLoadLifecycleSnapshot().loadPhase !== 'loaded') {
            return
          }

          const sortedOutpoints = sortArkadeVtxoOutpoints(job.selectedLeafOutpoints)
          const worker = getArkadeWorker()

          const progress = await worker.getUnilateralExitProgress({
            vtxoOutpoints: sortedOutpoints,
          })
          if (isStale()) return

          if (progress.phase === 'complete') {
            store.completeJob(activeWalletId!, networkMode, activeArkadeConnectionId!)
            useUnilateralExitControlStore.getState().reset()
            toast.success('Unilateral exit branch complete.')
            await invalidateUnilateralExitQueries(
              queryClient,
              activeWalletId!,
              networkMode,
              activeArkadeConnectionId!,
              sortedOutpoints,
            )
            return
          }

          const presetSatPerVbByLabel = await queryClient.fetchQuery({
            queryKey: [...ESPLORA_FEE_PRESETS_QUERY_KEY, networkMode] as const,
            queryFn: () => presetRatesForNetwork(networkMode),
          })
          if (isStale()) return

          const feeResolution = resolveAutomatedStepFeeRateSatPerVb(
            job.feePresetLabel,
            presetSatPerVbByLabel,
            job.maxFeeRateSatPerVb,
          )
          if (feeResolution.capExceeded) {
            store.pauseJob(
              activeWalletId!,
              networkMode,
              activeArkadeConnectionId!,
              'feeCapExceeded',
            )
            toast.error(pauseReasonToastMessage('feeCapExceeded'))
            return
          }

          const batchEstimate = await worker.estimateUnilateralExitBatch({
            vtxoOutpoints: sortedOutpoints,
            feeRateSatPerVb: feeResolution.feeRateSatPerVb,
          })
          if (isStale()) return

          if (!batchEstimate.bumperSufficient) {
            store.pauseJob(
              activeWalletId!,
              networkMode,
              activeArkadeConnectionId!,
              'bumperInsufficient',
            )
            toast.error(pauseReasonToastMessage('bumperInsufficient'))
            return
          }

          try {
            const proceedResult = await proceedUnilateralExitStepWithGuards({
              activeWalletId,
              vtxoOutpoints: sortedOutpoints,
              feeRateSatPerVb: feeResolution.feeRateSatPerVb,
            })
            if (proceedResult.phase === 'complete') {
              store.completeJob(activeWalletId!, networkMode, activeArkadeConnectionId!)
              useUnilateralExitControlStore.getState().reset()
              toast.success('Unilateral exit branch complete.')
              await invalidateUnilateralExitQueries(
                queryClient,
                activeWalletId!,
                networkMode,
                activeArkadeConnectionId!,
                sortedOutpoints,
              )
              return
            }
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Unroll step failed.'
            store.pauseJob(
              activeWalletId!,
              networkMode,
              activeArkadeConnectionId!,
              'error',
              message,
            )
            toast.error(pauseReasonToastMessage('error', message))
            return
          }

          if (isStale()) return

          await invalidateUnilateralExitQueries(
            queryClient,
            activeWalletId!,
            networkMode,
            activeArkadeConnectionId!,
            sortedOutpoints,
          )
      }
    }

    void runAutomationLoop().catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'Unroll step failed.'
      const store = useUnilateralExitAutomationStore.getState()
      store.pauseJob(
        activeWalletId!,
        networkMode,
        activeArkadeConnectionId!,
        'error',
        message,
      )
      toast.error(pauseReasonToastMessage('error', message))
    })

    return () => {
      cancelled = true
    }
  }, [
    activeArkadeConnectionId,
    activeWalletId,
    automationJob?.feePresetLabel,
    automationJob?.jobStarted,
    automationJob?.maxFeeRateSatPerVb,
    automationJob?.pausedReason,
    automationJob?.proceedAutomatically,
    automationJob?.selectedLeafOutpoints,
    automationStoreHydrated,
    networkMode,
    queryClient,
    walletStatus,
  ])
}
