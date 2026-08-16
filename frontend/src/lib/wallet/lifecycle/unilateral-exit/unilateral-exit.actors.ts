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
  isWaitingForRelayedStepConfirmation,
  needsBroadcastEnsurance,
  broadcastedStepIsVisibleOnNetwork,
  UNCONFIRMED_PARENT_PACKAGE_RETRY_MESSAGE,
  type ParentUnconfirmedPackageError,
} from '@/lib/arkade/unilateral-exit-broadcast'
import { isUnilateralExitBranchComplete } from '@/lib/arkade/unilateral-exit-branch-complete'
import { proceedUnilateralExitStepWithGuards } from '@/lib/arkade/proceed-unilateral-exit-step'
import { resolveAutomatedStepFeeRateSatPerVb } from '@/lib/arkade/unilateral-exit-automation-fees'
import { getArkadeLoadLifecycleSnapshot } from '@/lib/wallet/lifecycle/arkade-load-lifecycle-orchestrator'
import { useUnilateralExitAutomationPrefsStore } from '@/lib/wallet/lifecycle/unilateral-exit-automation-prefs-persistence'
import type {
  EnsureBroadcastActorInput,
  EvaluateAutomationPolicyActorInput,
  EvaluateJobViabilityActorInput,
  FetchProgressActorInput,
  ProceedStepActorInput,
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

function debugProgressSnapshot(progress: ArkadeUnilateralExitProgress) {
  const stepIndex = progress.stepIndex
  const previous = progress.nodeStatuses[stepIndex - 1]
  const current = progress.nodeStatuses[stepIndex]
  return {
    stepIndex,
    totalSteps: progress.totalSteps,
    phase: progress.phase,
    relayed: progress.currentStepTxRelayed,
    waitingSince: progress.currentStepWaitingSince ?? null,
    needsBroadcast: needsBroadcastEnsurance(progress),
    waitingRelayed: isWaitingForRelayedStepConfirmation(progress),
    prevTxid: previous?.txid.slice(0, 8) ?? null,
    prevConf: previous?.confirmations ?? null,
    prevStatus: previous?.status ?? null,
    currTxid: current?.txid.slice(0, 8) ?? null,
    currConf: current?.confirmations ?? null,
    currStatus: current?.status ?? null,
    nodeTxids: progress.nodeStatuses.map((node) => node.txid.slice(0, 8)),
    nodeConfs: progress.nodeStatuses.map((node) => node.confirmations),
    nodeStatuses: progress.nodeStatuses.map((node) => node.status),
  }
}

export const fetchProgressActor = fromPromise<
  ArkadeUnilateralExitProgress,
  FetchProgressActorInput
>(async ({ input }) => {
  const worker = getArkadeWorker()
  const progress = await worker.getUnilateralExitProgress({
    vtxoOutpoints: sortArkadeVtxoOutpoints(input.outpoints),
  })
  // #region agent log
  fetch('http://127.0.0.1:7757/ingest/cb0f3ed4-7e87-43d6-b1dd-18329fa2e328',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'2d2162'},body:JSON.stringify({sessionId:'2d2162',hypothesisId:'B',location:'unilateral-exit.actors.ts:fetchProgressActor',message:'fetchProgress',data:debugProgressSnapshot(progress),timestamp:Date.now()})}).catch(()=>{});
  // #endregion
  return progress
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
  // #region agent log
  fetch('http://127.0.0.1:7757/ingest/cb0f3ed4-7e87-43d6-b1dd-18329fa2e328',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'2d2162'},body:JSON.stringify({sessionId:'2d2162',hypothesisId:'A',location:'unilateral-exit.actors.ts:proceedStepActor',message:'proceedStep about to broadcast',data:{feeRateSatPerVb:input.feeRateSatPerVb},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
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
  // #region agent log
  fetch('http://127.0.0.1:7757/ingest/cb0f3ed4-7e87-43d6-b1dd-18329fa2e328',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'2d2162'},body:JSON.stringify({sessionId:'2d2162',hypothesisId:'A',location:'unilateral-exit.actors.ts:ensureBroadcastActor',message:'ensureBroadcast before maybe proceed',data:{...debugProgressSnapshot(progress),alreadyRelayed,automationEnabled:input.automationEnabled,hasFeeRate:input.feeRateSatPerVb!=null},timestamp:Date.now()})}).catch(()=>{});
  // #endregion

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

  // #region agent log
  fetch('http://127.0.0.1:7757/ingest/cb0f3ed4-7e87-43d6-b1dd-18329fa2e328',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'2d2162'},body:JSON.stringify({sessionId:'2d2162',hypothesisId:'A',location:'unilateral-exit.actors.ts:ensureBroadcastActor',message:'ensureBroadcast proceeding to broadcast',data:{stepIndex:progress.stepIndex,currTxid:progress.nodeStatuses[progress.stepIndex]?.txid.slice(0,8)??null,prevConf:progress.nodeStatuses[progress.stepIndex-1]?.confirmations??null,currConf:progress.nodeStatuses[progress.stepIndex]?.confirmations??null,automationEnabled:input.automationEnabled},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
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
    // #region agent log
    fetch('http://127.0.0.1:7757/ingest/cb0f3ed4-7e87-43d6-b1dd-18329fa2e328',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'2d2162'},body:JSON.stringify({sessionId:'2d2162',hypothesisId:'D',runId:'post-fix',location:'unilateral-exit.actors.ts:ensureBroadcastActor',message:'ensureBroadcast proceed failed',data:{stepIndex:progress.stepIndex,currTxid:progress.nodeStatuses[progress.stepIndex]?.txid.slice(0,8)??null,prevConf:progress.nodeStatuses[progress.stepIndex-1]?.confirmations??null,packageNotChild,error:error instanceof Error?error.message:String(error)},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    if (packageNotChild) {
      const rewound = await worker.getUnilateralExitProgress({
        vtxoOutpoints: sortedOutpoints,
      })
      await invalidateUnilateralExitQueries(input.walletScope, sortedOutpoints)
      // #region agent log
      fetch('http://127.0.0.1:7757/ingest/cb0f3ed4-7e87-43d6-b1dd-18329fa2e328',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'2d2162'},body:JSON.stringify({sessionId:'2d2162',hypothesisId:'C',runId:'post-fix',location:'unilateral-exit.actors.ts:ensureBroadcastActor',message:'package-not-child rewound progress',data:{beforeIndex:progress.stepIndex,rewoundIndex:rewound.stepIndex,rewoundTxid:rewound.nodeStatuses[rewound.stepIndex]?.txid.slice(0,8)??null,rewoundConf:rewound.nodeStatuses[rewound.stepIndex]?.confirmations??null,rewoundStatus:rewound.nodeStatuses[rewound.stepIndex]?.status??null},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
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
  // #region agent log
  fetch('http://127.0.0.1:7757/ingest/cb0f3ed4-7e87-43d6-b1dd-18329fa2e328',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'2d2162'},body:JSON.stringify({sessionId:'2d2162',hypothesisId:'H-relay',location:'unilateral-exit.actors.ts:ensureBroadcastActor',message:'broadcasted step visibility after proceed',data:{beforeIndex:progressBeforeBroadcast.stepIndex,afterIndex:progress.stepIndex,afterRelayed:progress.currentStepTxRelayed??null,visible},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
  if (!visible) {
    throw new Error(
      'Unilateral exit step transaction is not visible on the network after broadcast.',
    )
  }

  await invalidateUnilateralExitQueries(input.walletScope, sortedOutpoints)
  return progress
})

export const unilateralExitMachineActors = {
  fetchProgressActor,
  evaluateJobViabilityActor,
  proceedStepActor,
  evaluateAutomationPolicyActor,
  ensureBroadcastActor,
}
