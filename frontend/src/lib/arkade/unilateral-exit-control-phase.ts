import { isUnilateralExitBranchComplete } from '@/lib/arkade/unilateral-exit-branch-complete'
import type { UnilateralExitLifecyclePhase } from '@/lib/wallet/lifecycle/unilateral-exit-lifecycle-types'
import type {
  ArkadeUnilateralExitPhaseKind,
  ArkadeUnilateralExitProgress,
} from '@/workers/arkade-api'

export type UnilateralExitControlDisplayPhase =
  | ArkadeUnilateralExitPhaseKind
  | 'advancing'

export function resolveUnilateralExitControlJobState(params: {
  progress: ArkadeUnilateralExitProgress | null
  lifecyclePhase: UnilateralExitLifecyclePhase
  lifecycleJobActive: boolean
  hasInProgressExits: boolean
  proceedPending: boolean
  totalSteps: number
}): {
  phase: UnilateralExitControlDisplayPhase
  exitJobInFlight: boolean
  jobActive: boolean
  showStepProgress: boolean
} {
  const wasmPhase = params.progress?.phase ?? 'idle'
  const lifecyclePhase = params.lifecycleJobActive ? params.lifecyclePhase : 'idle'
  const branchComplete =
    (params.progress != null && isUnilateralExitBranchComplete(params.progress)) ||
    lifecyclePhase === 'complete'
  const phaseFromProgress: UnilateralExitControlDisplayPhase = branchComplete
    ? 'complete'
    : wasmPhase

  const exitJobInFlight =
    params.lifecycleJobActive ||
    params.hasInProgressExits ||
    params.proceedPending ||
    params.lifecyclePhase === 'advancing' ||
    params.lifecyclePhase === 'waiting-confirm'

  const phase: UnilateralExitControlDisplayPhase =
    !params.hasInProgressExits && !exitJobInFlight
      ? 'idle'
      : params.lifecyclePhase === 'waiting-confirm'
        ? 'waiting'
        : params.lifecyclePhase === 'advancing' && params.progress == null
          ? 'advancing'
          : phaseFromProgress

  const jobActive =
    params.lifecycleJobActive || params.hasInProgressExits || params.proceedPending

  return {
    phase,
    exitJobInFlight,
    jobActive,
    showStepProgress: exitJobInFlight && params.totalSteps > 0,
  }
}
