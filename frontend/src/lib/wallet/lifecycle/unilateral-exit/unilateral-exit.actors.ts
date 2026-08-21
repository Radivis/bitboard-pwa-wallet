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
import {
  isCurrentStepRelayed,
  isInsufficientConfirmedBumperFundsError,
  isPackageNotChildWithUnconfirmedParentsError,
  broadcastedStepIsVisibleOnNetwork,
  UNCONFIRMED_PARENT_PACKAGE_RETRY_MESSAGE,
  type ParentUnconfirmedPackageError,
} from '@/lib/arkade/unilateral-exit-broadcast'
import { isUnilateralExitBranchComplete } from '@/lib/arkade/unilateral-exit-branch-complete'
import { proceedUnilateralExitStepWithGuards } from '@/lib/arkade/proceed-unilateral-exit-step'
import { resolveAutomatedStepFeeRateSatPerVb } from '@/lib/arkade/unilateral-exit-automation-fees'
import { getArkadeLoadLifecycleSnapshot } from '@/lib/wallet/lifecycle/arkade-load-lifecycle-orchestrator'
import { useUnilateralExitAutomationPrefsStore } from '@/lib/wallet/lifecycle/unilateral-exit-automation-prefs-persistence'
import { resolveVtxoIdsForOutpoints } from '@/lib/wallet/lifecycle/unilateral-exit/unilateral-exit-vtxo-ids'
import type {
  EnsureBroadcastActorInput,
  EvaluateAutomationPolicyActorInput,
  EvaluateJobViabilityActorInput,
  FetchProgressActorInput,
  ProceedStepActorInput,
  ResolveAbortVtxoIdsActorInput,
} from '@/lib/wallet/lifecycle/unilateral-exit/unilateral-exit.machine'
import type { UnilateralExitPolicyEvaluation } from '@/lib/wallet/lifecycle/unilateral-exit/unilateral-exit-machine-types'
import type { UnilateralExitWalletScope } from '@/lib/wallet/lifecycle/unilateral-exit-lifecycle-types'
import { walletIsUnlockedOrSyncing } from '@/lib/wallet/wallet-unlocked-status'
import { useWalletStore } from '@/stores/walletStore'
import { getArkadeWorker } from '@/workers/arkade-factory'
import { sortArkadeVtxoOutpoints } from '@/workers/arkade-api'
import type { ArkadeUnilateralExitProgress, ArkadeUnilateralExitJobViability } from '@/workers/arkade-api'
import { fromPromise } from 'xstate'

function assertCanRunUnilateralExit(scope: UnilateralExitWalletScope): void {
  if (!walletIsUnlockedOrSyncing(useWalletStore.getState().walletStatus)) {
    throw new Error('Wallet must be unlocked')
  }
  if (!isArkadeActiveForNetworkMode(scope.networkMode)) {
    throw new Error('Arkade is not enabled for this network')
  }
  if (!isArkadeSupportedNetworkMode(scope.networkMode)) {
    throw new Error('Arkade is not supported on this network')
  }
  const loadSnapshot = getArkadeLoadLifecycleSnapshot()
  if (loadSnapshot.loadPhase === 'loading') {
    throw new Error('Unilateral exit cannot start while Arkade load is in progress')
  }
  if (loadSnapshot.loadPhase !== 'loaded') {
    throw new Error('Unilateral exit requires a loaded Arkade session')
  }
}

export async function invalidateUnilateralExitQueries(
  scope: UnilateralExitWalletScope,
  outpoints: FetchProgressActorInput['outpoints'],
): Promise<void> {
  if (!isArkadeSupportedNetworkMode(scope.networkMode)) {
    return
  }
  const sortedOutpoints = sortArkadeVtxoOutpoints(outpoints)
  const { appQueryClient } = await import('@/lib/shared/app-query-client')
  const progressQueryKey = arkadeUnilateralExitProgressQueryKey(
    scope.walletId,
    scope.networkMode,
    scope.connectionId,
    sortedOutpoints,
  )
  await appQueryClient.removeQueries({ queryKey: progressQueryKey })
  await appQueryClient.invalidateQueries({
    queryKey: progressQueryKey,
  })
  await appQueryClient.invalidateQueries({
    queryKey: arkadeBalanceQueryKey(scope.walletId, scope.networkMode, scope.connectionId),
  })
  await appQueryClient.invalidateQueries({
    queryKey: arkadeUnilateralExitTopologyScopeKey(
      scope.walletId,
      scope.networkMode,
      scope.connectionId,
    ),
  })
}

export async function evaluateUnilateralExitAutomationPolicy(
  input: EvaluateAutomationPolicyActorInput,
): Promise<UnilateralExitPolicyEvaluation> {
  assertCanRunUnilateralExit(input.walletScope)
  const prefs = useUnilateralExitAutomationPrefsStore
    .getState()
    .getPrefs(
      input.walletScope.walletId,
      input.walletScope.networkMode,
      input.walletScope.connectionId,
    )
  const { appQueryClient } = await import('@/lib/shared/app-query-client')
  const presetSatPerVbByLabel = await appQueryClient.fetchQuery({
    queryKey: [...ESPLORA_FEE_PRESETS_QUERY_KEY, input.walletScope.networkMode] as const,
    queryFn: () => presetRatesForNetwork(input.walletScope.networkMode),
  })
  const feeResolution = resolveAutomatedStepFeeRateSatPerVb(
    prefs.feePresetLabel,
    presetSatPerVbByLabel,
    prefs.maxFeeRateSatPerVb,
  )
  if (feeResolution.capExceeded) {
    return {
      feeRateSatPerVb: feeResolution.feeRateSatPerVb,
      pausedReason: 'feeCapExceeded' as const,
    }
  }
  const batchEstimate = await getArkadeWorker().estimateUnilateralExitBatch({
    vtxoOutpoints: sortArkadeVtxoOutpoints(input.outpoints),
    feeRateSatPerVb: feeResolution.feeRateSatPerVb,
  })
  if (!batchEstimate.bumperSufficient) {
    return {
      feeRateSatPerVb: feeResolution.feeRateSatPerVb,
      pausedReason: 'bumperInsufficient' as const,
    }
  }
  return {
    feeRateSatPerVb: feeResolution.feeRateSatPerVb,
    pausedReason: null,
  }
}

export const fetchProgressActor = fromPromise<
  ArkadeUnilateralExitProgress,
  FetchProgressActorInput
>(async ({ input }) => {
  const worker = getArkadeWorker()
  return worker.getUnilateralExitProgress({
    vtxoOutpoints: sortArkadeVtxoOutpoints(input.outpoints),
  })
})

export const evaluateJobViabilityActor = fromPromise<
  ArkadeUnilateralExitJobViability,
  EvaluateJobViabilityActorInput
>(async ({ input }) => {
  const worker = getArkadeWorker()
  return worker.evaluateUnilateralExitJobViability({
    vtxoOutpoints: sortArkadeVtxoOutpoints(input.outpoints),
  })
})

export const proceedStepActor = fromPromise<
  ArkadeUnilateralExitProgress,
  ProceedStepActorInput
>(async ({ input }) => {
  assertCanRunUnilateralExit(input.walletScope)
  if (input.outpoints.length === 0) {
    throw new Error('Select at least one exit-eligible VTXO leaf.')
  }
  const sortedOutpoints = sortArkadeVtxoOutpoints(input.outpoints)
  await proceedUnilateralExitStepWithGuards({
    activeWalletId: input.walletScope.walletId,
    vtxoOutpoints: sortedOutpoints,
    feeRateSatPerVb: input.feeRateSatPerVb,
  })
  const progress = await getArkadeWorker().getUnilateralExitProgress({
    vtxoOutpoints: sortedOutpoints,
  })
  await invalidateUnilateralExitQueries(input.walletScope, sortedOutpoints)
  return progress
})

export const evaluateAutomationPolicyActor = fromPromise<
  UnilateralExitPolicyEvaluation,
  EvaluateAutomationPolicyActorInput
>(async ({ input }) => evaluateUnilateralExitAutomationPolicy(input))

export const ensureBroadcastActor = fromPromise<
  ArkadeUnilateralExitProgress,
  EnsureBroadcastActorInput
>(async ({ input }) => {
  assertCanRunUnilateralExit(input.walletScope)
  if (input.outpoints.length === 0) {
    throw new Error('Select at least one exit-eligible VTXO leaf.')
  }

  const sortedOutpoints = sortArkadeVtxoOutpoints(input.outpoints)
  const worker = getArkadeWorker()
  let progress = await worker.getUnilateralExitProgress({
    vtxoOutpoints: sortedOutpoints,
  })
  const alreadyRelayed = isCurrentStepRelayed(progress)

  if (isUnilateralExitBranchComplete(progress) || alreadyRelayed) {
    return progress
  }

  let feeRateSatPerVb = input.feeRateSatPerVb
  if (feeRateSatPerVb == null) {
    if (!input.automationEnabled) {
      throw new Error('Fee rate is required to broadcast the unilateral exit step.')
    }
    const policy = await evaluateUnilateralExitAutomationPolicy({
      walletScope: input.walletScope,
      outpoints: input.outpoints,
    })
    if (policy.pausedReason != null) {
      throw new Error(
        policy.pausedReason === 'feeCapExceeded'
          ? 'Automatic unilateral exit paused: Live fee rate exceeds your maximum.'
          : 'Automatic unilateral exit paused: Insufficient bumper balance.',
      )
    }
    feeRateSatPerVb = policy.feeRateSatPerVb
  }

  try {
    await proceedUnilateralExitStepWithGuards({
      activeWalletId: input.walletScope.walletId,
      vtxoOutpoints: sortedOutpoints,
      feeRateSatPerVb,
    })
  } catch (error) {
    const packageNotChild =
      isPackageNotChildWithUnconfirmedParentsError(error) ||
      isInsufficientConfirmedBumperFundsError(error)
    if (packageNotChild) {
      const rewound = await worker.getUnilateralExitProgress({
        vtxoOutpoints: sortedOutpoints,
      })
      await invalidateUnilateralExitQueries(input.walletScope, sortedOutpoints)
      const wrapped = new Error(
        UNCONFIRMED_PARENT_PACKAGE_RETRY_MESSAGE,
      ) as ParentUnconfirmedPackageError
      wrapped.rewoundProgress = rewound
      wrapped.retryableUnconfirmedParent = true
      throw wrapped
    }
    throw error
  }

  const progressBeforeBroadcast = progress
  progress = await worker.getUnilateralExitProgress({
    vtxoOutpoints: sortedOutpoints,
  })

  const visible = broadcastedStepIsVisibleOnNetwork(progressBeforeBroadcast, progress)
  if (!visible) {
    throw new Error(
      'Unilateral exit step transaction is not visible on the network after broadcast.',
    )
  }

  await invalidateUnilateralExitQueries(input.walletScope, sortedOutpoints)
  return progress
})

const ABORT_VTXO_ID_RESOLVE_TIMEOUT_MS = 3_000

async function listOrEmpty<T>(load: () => Promise<T[]>): Promise<T[]> {
  try {
    return await load()
  } catch {
    return []
  }
}

function withTimeoutFallback<T>(
  promise: Promise<T>,
  timeoutMs: number,
  fallback: T,
): Promise<T> {
  return new Promise((resolve) => {
    const timeoutId = setTimeout(() => resolve(fallback), timeoutMs)
    void promise.then(
      (value) => {
        clearTimeout(timeoutId)
        resolve(value)
      },
      () => {
        clearTimeout(timeoutId)
        resolve(fallback)
      },
    )
  })
}

export async function resolveAbortVtxoIdsBestEffort(
  outpoints: ResolveAbortVtxoIdsActorInput['outpoints'],
): Promise<string[]> {
  try {
    const worker = getArkadeWorker()
    const [candidates, inProgressRows] = await Promise.all([
      listOrEmpty(() => worker.listExitCandidates()),
      listOrEmpty(() => worker.listUnilateralExitsInProgress()),
    ])
    return resolveVtxoIdsForOutpoints(outpoints, candidates, inProgressRows)
  } catch {
    return []
  }
}

export const resolveAbortVtxoIdsActor = fromPromise<
  { vtxoIds: string[] },
  ResolveAbortVtxoIdsActorInput
>(async ({ input }) => ({
  vtxoIds: await withTimeoutFallback(
    resolveAbortVtxoIdsBestEffort(input.outpoints),
    ABORT_VTXO_ID_RESOLVE_TIMEOUT_MS,
    [],
  ),
}))

export const unilateralExitMachineActors = {
  fetchProgressActor,
  evaluateJobViabilityActor,
  proceedStepActor,
  evaluateAutomationPolicyActor,
  ensureBroadcastActor,
  resolveAbortVtxoIdsActor,
}
