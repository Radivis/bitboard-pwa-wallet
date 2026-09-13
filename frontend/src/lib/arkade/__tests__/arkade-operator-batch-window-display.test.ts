import { describe, expect, it } from 'vitest'
import {
  advanceStaleOperatorScheduledSession,
  formatArkadeOperatorBatchWindow,
  formatSchedulePeriodLabel,
} from '@/lib/arkade/arkade-operator-batch-window-display'
import type { ArkadeOperatorScheduledSession } from '@/workers/arkade-api'

const baseSession: ArkadeOperatorScheduledSession = {
  nextStartTime: 1_700_000_000,
  nextEndTime: 1_700_000_600,
  period: 3_600,
  duration: 600,
  inProgress: false,
}

describe('arkade-operator-batch-window-display', () => {
  it('advanceStaleOperatorScheduledSession_shifts_past_windows_by_period', () => {
    const advanced = advanceStaleOperatorScheduledSession(baseSession, 1_700_003_700)
    expect(advanced.nextStartTime).toBe(1_700_003_600)
    expect(advanced.nextEndTime).toBe(1_700_004_200)
    expect(advanced.inProgress).toBe(true)
  })

  it('formatArkadeOperatorBatchWindow_shows_upcoming_start', () => {
    const text = formatArkadeOperatorBatchWindow(baseSession, 1_699_999_000)
    expect(text.primary).toContain('Next operator batch round starts')
    expect(text.primary).toMatch(/\(\d{4}-\d{2}-\d{2} \d{2}:\d{2}\)/)
    expect(text.periodSuffix).toBe('Repeats every 1 h')
  })

  it('formatArkadeOperatorBatchWindow_shows_in_progress_end', () => {
    const inProgress: ArkadeOperatorScheduledSession = {
      ...baseSession,
      inProgress: true,
    }
    const text = formatArkadeOperatorBatchWindow(inProgress, 1_700_000_100)
    expect(text.primary).toContain('Operator batch round in progress')
    expect(text.primary).toContain('ends')
  })

  it('formatSchedulePeriodLabel_formats_minutes', () => {
    expect(formatSchedulePeriodLabel(300)).toBe('every 5 min')
  })
})
