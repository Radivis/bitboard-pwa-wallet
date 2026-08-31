import type {
  ArkadeUnilateralExitPhaseKind,
} from '@/workers/arkade-api'

export type UnilateralExitControlDisplayPhase =
  | ArkadeUnilateralExitPhaseKind
  | 'advancing'
  | 'ensuringBroadcast'
  | 'waitingForParentData'

export type UnilateralExitInProgressOverlayKind =
  | 'ensuringBroadcast'
  | 'waiting'
  | 'waitingForParentData'
  | 'readyToProceed'

/**
 * Step-progress suffix and overlay label while `waitingForParentData`.
 * GET `/tx/status` can already show the parent confirmed; submitpackage may not.
 */
export const UNILATERAL_EXIT_WAITING_FOR_PARENT_DATA_COPY =
  'Waiting for Esplora to acknowledge parent data'

export const UNILATERAL_EXIT_PROCEEDING_AUTOMATICALLY_SUFFIX =
  ' (proceeding automatically)'

function appendAutomaticProceedingSuffix(
  label: string,
  proceedingAutomatically: boolean,
): string {
  if (!proceedingAutomatically) {
    return label
  }
  return `${label}${UNILATERAL_EXIT_PROCEEDING_AUTOMATICALLY_SUFFIX}`
}

export function unilateralExitInProgressOverlayLabel(
  overlay: UnilateralExitInProgressOverlayKind,
  options?: { proceedingAutomatically?: boolean },
): string | undefined {
  const proceedingAutomatically = options?.proceedingAutomatically === true
  switch (overlay) {
    case 'waitingForParentData':
      return appendAutomaticProceedingSuffix(
        UNILATERAL_EXIT_WAITING_FOR_PARENT_DATA_COPY,
        proceedingAutomatically,
      )
    case 'waiting':
      return appendAutomaticProceedingSuffix('Waiting for confirmation', proceedingAutomatically)
    case 'ensuringBroadcast':
      return appendAutomaticProceedingSuffix('Broadcasting', proceedingAutomatically)
    case 'readyToProceed':
      return undefined
  }
}

function unilateralExitStepProgressPhaseDetail(params: {
  phase: UnilateralExitControlDisplayPhase
  hasPersistedFailure: boolean
  stepWaitingDurationLabel: string | null
}): string {
  if (params.hasPersistedFailure) {
    return ''
  }
  if (params.phase === 'complete') {
    return ' — branch complete'
  }
  if (params.phase === 'waitingForParentData') {
    return ` — ${UNILATERAL_EXIT_WAITING_FOR_PARENT_DATA_COPY}`
  }
  if (params.phase === 'ensuringBroadcast') {
    return ' — broadcasting and monitoring broadcast success'
  }
  if (params.phase === 'waiting' || params.stepWaitingDurationLabel != null) {
    const duration =
      params.stepWaitingDurationLabel != null ? ` (${params.stepWaitingDurationLabel})` : ''
    return ` — waiting for confirmation${duration}`
  }
  return ''
}

export function isUnilateralExitProceedingAutomatically(params: {
  phase: UnilateralExitControlDisplayPhase
  hasPersistedFailure: boolean
  automationEnabled: boolean
  automationPaused: boolean
  jobInFlight: boolean
}): boolean {
  return (
    params.automationEnabled &&
    !params.automationPaused &&
    params.phase !== 'complete' &&
    !params.hasPersistedFailure &&
    params.jobInFlight
  )
}

export function formatUnilateralExitStepProgressDetail(params: {
  phase: UnilateralExitControlDisplayPhase
  hasPersistedFailure: boolean
  stepWaitingDurationLabel: string | null
  proceedingAutomatically: boolean
}): string {
  const phaseDetail = unilateralExitStepProgressPhaseDetail(params)
  return appendAutomaticProceedingSuffix(phaseDetail, params.proceedingAutomatically)
}
