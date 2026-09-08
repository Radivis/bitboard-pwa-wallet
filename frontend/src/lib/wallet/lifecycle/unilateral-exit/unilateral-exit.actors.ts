import {
  ESPLORA_FEE_PRESETS_QUERY_KEY,
  presetRatesForNetwork,
} from '@/hooks/useEsploraFeePresets'
import { isArkadeSupportedNetworkMode } from '@/lib/arkade/arkade-endpoints'
import { isArkadeActiveForNetworkMode } from '@/lib/arkade/arkade-utils'
import { applyOptimisticExitBalanceDeduction } from '@/lib/arkade/arkade-exit-balance-optimistic'
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
import { getPersistedUnilateralExitJob } from '@/lib/wallet/lifecycle/unilateral-exit-lifecycle-persistence'
import { useUnilateralExitAutomationPrefsStore } from '@/lib/wallet/lifecycle/unilateral-exit-automation-prefs-persistence'
import { resolveVtxoIdsForOutpoints } from '@/lib/wallet/lifecycle/unilateral-exit/unilateral-exit-vtxo-ids'
import type {
  EnsureBroadcastActorInput,
  EvaluateAutomationPolicyActorInput,
  EvaluateJobViabilityActorInput,
  FetchProgressActorInput,
  ProceedStepActorInput,
  ResolveAbortVtxoIdsActorInput,
  TagPlanActorInput,
} from '@/lib/wallet/lifecycle/unilateral-exit/unilateral-exit.machine'
import {
  invalidateUnilateralExitQueries,
  writeUnilateralExitProgressQueryCache,
} from '@/lib/wallet/lifecycle/unilateral-exit/unilateral-exit-query-cache'
import type { UnilateralExitPolicyEvaluation } from '@/lib/wallet/lifecycle/unilateral-exit/unilateral-exit-machine-types'
import type { ArkadeWalletScope } from '@/lib/arkade/arkade-session-scope'
import { walletIsUnlockedOrSyncing } from '@/lib/wallet/wallet-unlocked-status'
import { useWalletStore } from '@/stores/walletStore'
import { getArkadeWorker } from '@/workers/arkade-factory'
import {
  arkadeVtxoOutpointListsEqual,
  sortArkadeVtxoOutpoints,
  type ArkadeExitCandidateDto,
  type ArkadeUnilateralExitProgress,
  type ArkadeUnilateralExitJobViability,
  type ArkadeVtxoOutpoint,
} from '@/workers/arkade-api'
import { fromPromise } from 'xstate'
import { withEsploraFullScanRetries } from '@/lib/esplora/esplora-full-scan-retry'

function assertCanRunUnilateralExit(scope: ArkadeWalletScope): void {
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

export { invalidateUnilateralExitQueries }

export async function evaluateUnilateralExitAutomationPolicy(
  input: EvaluateAutomationPolicyActorInput,
): Promise<UnilateralExitPolicyEvaluation> {
  assertCanRunUnilateralExit(input.walletScope)
  const prefs = useUnilateralExitAutomationPrefsStore
    .getState()
    .getPrefs(
      input.walletScope.walletId,
      input.walletScope.networkMode,
      input.walletScope.arkadeAccountId,
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

function selectedLeafOptimisticSats(
  outpoints: ArkadeVtxoOutpoint[],
  candidates: ArkadeExitCandidateDto[],
): number {
  const selectedKeys = new Set(outpoints.map((outpoint) => `${outpoint.txid}:${outpoint.vout}`))
  let deductedSats = 0
  for (const candidate of candidates) {
    if (selectedKeys.has(`${candidate.txid}:${candidate.vout}`)) {
      deductedSats += candidate.amountSats
    }
  }
  return deductedSats
}

async function listOrEmpty<T>(load: () => Promise<T[]>): Promise<T[]> {
  try {
    return await load()
  } catch {
    return []
  }
}

async function loadProgressFromWorker(
  sortedOutpoints: ArkadeVtxoOutpoint[],
): Promise<ArkadeUnilateralExitProgress> {
  return withEsploraFullScanRetries(() =>
    getArkadeWorker().getUnilateralExitProgress({
      vtxoOutpoints: sortedOutpoints,
    }),
  )
}

async function hydrateVtxoExitChildrenAfterBEntry(): Promise<void> {
  const { hydrateVtxoExitChildrenFromWasm } = await import(
    '@/lib/wallet/lifecycle/unilateral-exit/unilateral-exit-runtime'
  )
  await hydrateVtxoExitChildrenFromWasm()
}

export async function loadUnilateralExitProgressWithRetries(
  input: FetchProgressActorInput,
): Promise<ArkadeUnilateralExitProgress> {
  const sortedOutpoints = sortArkadeVtxoOutpoints(input.outpoints)
  const progress = await loadProgressFromWorker(sortedOutpoints)
  if (input.walletScope != null) {
    await writeUnilateralExitProgressQueryCache(input.walletScope, sortedOutpoints, progress)
  }
  await hydrateVtxoExitChildrenAfterBEntry()
  return progress
}

export async function evaluateUnilateralExitJobViabilityWithRetries(
  input: EvaluateJobViabilityActorInput,
): Promise<ArkadeUnilateralExitJobViability> {
  const worker = getArkadeWorker()
  return withEsploraFullScanRetries(() =>
    worker.evaluateUnilateralExitJobViability({
      vtxoOutpoints: sortArkadeVtxoOutpoints(input.outpoints),
    }),
  )
}

export const fetchProgressActor = fromPromise<
  ArkadeUnilateralExitProgress,
  FetchProgressActorInput
>(async ({ input }) => loadUnilateralExitProgressWithRetries(input))

export const evaluateJobViabilityActor = fromPromise<
  ArkadeUnilateralExitJobViability,
  EvaluateJobViabilityActorInput
>(async ({ input }) => evaluateUnilateralExitJobViabilityWithRetries(input))

export const tagPlanActor = fromPromise<void, TagPlanActorInput>(async ({ input }) => {
  assertCanRunUnilateralExit(input.walletScope)
  if (input.outpoints.length === 0) {
    throw new Error('Select at least one exit-eligible VTXO leaf.')
  }
  const sortedOutpoints = sortArkadeVtxoOutpoints(input.outpoints)
  const worker = getArkadeWorker()
  const existingJob = getPersistedUnilateralExitJob(input.walletScope)
  const hydrateExistingJob = arkadeVtxoOutpointListsEqual(
    existingJob.selectedLeafOutpoints,
    sortedOutpoints,
  )

  await worker.tagUnilateralExitPlan({ vtxoOutpoints: sortedOutpoints })

  if (!hydrateExistingJob && isArkadeSupportedNetworkMode(input.walletScope.networkMode)) {
    const candidates = await listOrEmpty(() => worker.listExitCandidates())
    const deductedSats = selectedLeafOptimisticSats(sortedOutpoints, candidates)
    if (deductedSats > 0) {
      const { appQueryClient } = await import('@/lib/shared/app-query-client')
      applyOptimisticExitBalanceDeduction(
        appQueryClient,
        input.walletScope.walletId,
        input.walletScope.networkMode,
        input.walletScope.arkadeAccountId,
        deductedSats,
        'unilateralExitInProgressSats',
      )
    }
  }

  await invalidateUnilateralExitQueries(input.walletScope, sortedOutpoints)
  await hydrateVtxoExitChildrenAfterBEntry()
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
    walletScope: input.walletScope,
    vtxoOutpoints: sortedOutpoints,
    feeRateSatPerVb: input.feeRateSatPerVb,
  })
  const progress = await loadProgressFromWorker(sortedOutpoints)
  await invalidateUnilateralExitQueries(input.walletScope, sortedOutpoints, progress)
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
  let progress = await loadProgressFromWorker(sortedOutpoints)
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
      walletScope: input.walletScope,
      vtxoOutpoints: sortedOutpoints,
      feeRateSatPerVb,
    })
  } catch (error) {
    const packageNotChild =
      isPackageNotChildWithUnconfirmedParentsError(error) ||
      isInsufficientConfirmedBumperFundsError(error)
    if (packageNotChild) {
      const rewound = await loadProgressFromWorker(sortedOutpoints)
      await invalidateUnilateralExitQueries(input.walletScope, sortedOutpoints, rewound)
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
  progress = await loadProgressFromWorker(sortedOutpoints)

  const visible = broadcastedStepIsVisibleOnNetwork(progressBeforeBroadcast, progress)
  if (!visible) {
    throw new Error(
      'Unilateral exit step transaction is not visible on the network after broadcast.',
    )
  }

  await invalidateUnilateralExitQueries(input.walletScope, sortedOutpoints, progress)
  return progress
})

const ABORT_VTXO_ID_RESOLVE_TIMEOUT_MS = 3_000

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
>(async ({ input }) => {
  if (input.outpoints.length > 0) {
    try {
      await getArkadeWorker().untagUnilateralExitPlanIfSafe({
        vtxoOutpoints: sortArkadeVtxoOutpoints(input.outpoints),
      })
    } catch {
      // Abort still clears the frontend job; leftover tags stay spend-locked.
    }
  }
  return {
    vtxoIds: await withTimeoutFallback(
      resolveAbortVtxoIdsBestEffort(input.outpoints),
      ABORT_VTXO_ID_RESOLVE_TIMEOUT_MS,
      [],
    ),
  }
})

export const unilateralExitMachineActors = {
  fetchProgressActor,
  evaluateJobViabilityActor,
  tagPlanActor,
  proceedStepActor,
  evaluateAutomationPolicyActor,
  ensureBroadcastActor,
  resolveAbortVtxoIdsActor,
}
