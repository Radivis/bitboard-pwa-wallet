import { describe, expect, it } from 'vitest'
import {
  formatUnilateralExitStepProgressDetail,
  isUnilateralExitProceedingAutomatically,
  UNILATERAL_EXIT_FIGURING_OUT_COPY,
  UNILATERAL_EXIT_PROCEEDING_AUTOMATICALLY_SUFFIX,
  UNILATERAL_EXIT_WAITING_FOR_PARENT_DATA_COPY,
  unilateralExitInProgressOverlayLabel,
} from '@/lib/arkade/unilateral-exit-control-phase'

const automaticJob = {
  hasPersistedFailure: false,
  stepWaitingDurationLabel: null as string | null,
  proceedingAutomatically: true,
}

describe('formatUnilateralExitStepProgressDetail', () => {
  it('uses the same phase labels in manual mode', () => {
    const manual = {
      hasPersistedFailure: false,
      stepWaitingDurationLabel: null,
      proceedingAutomatically: false,
    }

    expect(formatUnilateralExitStepProgressDetail({ ...manual, phase: 'complete' })).toBe(
      ' — branch complete',
    )
    expect(
      formatUnilateralExitStepProgressDetail({ ...manual, phase: 'waitingForParentData' }),
    ).toBe(` — ${UNILATERAL_EXIT_WAITING_FOR_PARENT_DATA_COPY}`)
    expect(
      formatUnilateralExitStepProgressDetail({ ...manual, phase: 'ensuringBroadcast' }),
    ).toBe(' — broadcasting and monitoring broadcast success')
    expect(formatUnilateralExitStepProgressDetail({ ...manual, phase: 'waiting' })).toBe(
      ' — waiting for confirmation',
    )
    expect(
      formatUnilateralExitStepProgressDetail({
        ...manual,
        phase: 'waiting',
        stepWaitingDurationLabel: '1m 2s',
      }),
    ).toBe(' — waiting for confirmation (1m 2s)')
    expect(formatUnilateralExitStepProgressDetail({ ...manual, phase: 'advancing' })).toBe(
      ` — ${UNILATERAL_EXIT_FIGURING_OUT_COPY}`,
    )
  })

  it('appends the automatic suffix to the same phase labels', () => {
    expect(formatUnilateralExitStepProgressDetail({ ...automaticJob, phase: 'advancing' })).toBe(
      ` — ${UNILATERAL_EXIT_FIGURING_OUT_COPY}${UNILATERAL_EXIT_PROCEEDING_AUTOMATICALLY_SUFFIX}`,
    )
    expect(
      formatUnilateralExitStepProgressDetail({ ...automaticJob, phase: 'ensuringBroadcast' }),
    ).toBe(
      ` — broadcasting and monitoring broadcast success${UNILATERAL_EXIT_PROCEEDING_AUTOMATICALLY_SUFFIX}`,
    )
    expect(formatUnilateralExitStepProgressDetail({ ...automaticJob, phase: 'waiting' })).toBe(
      ` — waiting for confirmation${UNILATERAL_EXIT_PROCEEDING_AUTOMATICALLY_SUFFIX}`,
    )
    expect(
      formatUnilateralExitStepProgressDetail({
        ...automaticJob,
        phase: 'waiting',
        stepWaitingDurationLabel: '1m 2s',
      }),
    ).toBe(` — waiting for confirmation (1m 2s)${UNILATERAL_EXIT_PROCEEDING_AUTOMATICALLY_SUFFIX}`)
    expect(
      formatUnilateralExitStepProgressDetail({ ...automaticJob, phase: 'waitingForParentData' }),
    ).toBe(
      ` — ${UNILATERAL_EXIT_WAITING_FOR_PARENT_DATA_COPY}${UNILATERAL_EXIT_PROCEEDING_AUTOMATICALLY_SUFFIX}`,
    )
  })

  it('does not append the automatic suffix when complete or failed', () => {
    expect(
      formatUnilateralExitStepProgressDetail({
        phase: 'complete',
        hasPersistedFailure: false,
        stepWaitingDurationLabel: null,
        proceedingAutomatically: false,
      }),
    ).toBe(' — branch complete')
    expect(
      formatUnilateralExitStepProgressDetail({
        phase: 'waiting',
        hasPersistedFailure: true,
        stepWaitingDurationLabel: null,
        proceedingAutomatically: false,
      }),
    ).toBe('')
  })
})

describe('isUnilateralExitProceedingAutomatically', () => {
  const active = {
    phase: 'advancing' as const,
    hasPersistedFailure: false,
    automationEnabled: true,
    automationPaused: false,
    jobInFlight: true,
  }

  it('is true only while automation is advancing an in-flight job', () => {
    expect(isUnilateralExitProceedingAutomatically(active)).toBe(true)
    expect(isUnilateralExitProceedingAutomatically({ ...active, phase: 'waiting' })).toBe(true)
    expect(isUnilateralExitProceedingAutomatically({ ...active, phase: 'complete' })).toBe(false)
    expect(isUnilateralExitProceedingAutomatically({ ...active, automationPaused: true })).toBe(
      false,
    )
    expect(isUnilateralExitProceedingAutomatically({ ...active, hasPersistedFailure: true })).toBe(
      false,
    )
    expect(isUnilateralExitProceedingAutomatically({ ...active, jobInFlight: false })).toBe(false)
    expect(isUnilateralExitProceedingAutomatically({ ...active, automationEnabled: false })).toBe(
      false,
    )
  })
})

describe('unilateralExitInProgressOverlayLabel', () => {
  it('appends the automatic suffix to overlay labels', () => {
    expect(unilateralExitInProgressOverlayLabel('waiting')).toBe('Waiting for confirmation')
    expect(unilateralExitInProgressOverlayLabel('waiting', { proceedingAutomatically: true })).toBe(
      `Waiting for confirmation${UNILATERAL_EXIT_PROCEEDING_AUTOMATICALLY_SUFFIX}`,
    )
    expect(
      unilateralExitInProgressOverlayLabel('ensuringBroadcast', { proceedingAutomatically: true }),
    ).toBe(`Broadcasting${UNILATERAL_EXIT_PROCEEDING_AUTOMATICALLY_SUFFIX}`)
    expect(unilateralExitInProgressOverlayLabel('figuringOut')).toBe('Figuring out what to do next')
    expect(
      unilateralExitInProgressOverlayLabel('figuringOut', { proceedingAutomatically: true }),
    ).toBe(`Figuring out what to do next${UNILATERAL_EXIT_PROCEEDING_AUTOMATICALLY_SUFFIX}`)
    expect(
      unilateralExitInProgressOverlayLabel('readyToProceed', { proceedingAutomatically: true }),
    ).toBeUndefined()
  })
})
