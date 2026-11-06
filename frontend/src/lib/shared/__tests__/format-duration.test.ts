import { describe, expect, it } from 'vitest'
import { formatDurationDaysHoursMinutesSeconds } from '@/lib/shared/format-duration'

describe('formatDurationDaysHoursMinutesSeconds', () => {
  it('shows only seconds under a minute', () => {
    expect(formatDurationDaysHoursMinutesSeconds(0)).toBe('0 seconds')
    expect(formatDurationDaysHoursMinutesSeconds(45)).toBe('45 seconds')
  })

  it('shows minutes and seconds under an hour', () => {
    expect(formatDurationDaysHoursMinutesSeconds(120)).toBe('2 minutes 0 seconds')
    expect(formatDurationDaysHoursMinutesSeconds(125)).toBe('2 minutes 5 seconds')
  })

  it('shows hours, minutes, and seconds under a day', () => {
    expect(formatDurationDaysHoursMinutesSeconds(3_600)).toBe('1 hours 0 minutes 0 seconds')
    expect(formatDurationDaysHoursMinutesSeconds(3_661)).toBe('1 hours 1 minutes 1 seconds')
  })

  it('shows days together with hours, minutes, and seconds', () => {
    expect(formatDurationDaysHoursMinutesSeconds(86_400)).toBe('1 days 0 hours 0 minutes 0 seconds')
    expect(formatDurationDaysHoursMinutesSeconds(183_845)).toBe('2 days 3 hours 4 minutes 5 seconds')
  })
})
