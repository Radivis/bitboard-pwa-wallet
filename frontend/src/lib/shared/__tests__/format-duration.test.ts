import { describe, expect, it } from 'vitest'
import {
  formatCoarseDurationSeconds,
  formatDurationDaysHoursMinutesSeconds,
} from '@/lib/shared/format-duration'

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
    expect(formatDurationDaysHoursMinutesSeconds(3_600)).toBe('1 hour 0 minutes 0 seconds')
    expect(formatDurationDaysHoursMinutesSeconds(3_661)).toBe('1 hour 1 minute 1 second')
  })

  it('shows days together with hours, minutes, and seconds', () => {
    expect(formatDurationDaysHoursMinutesSeconds(86_400)).toBe('1 day 0 hours 0 minutes 0 seconds')
    expect(formatDurationDaysHoursMinutesSeconds(183_845)).toBe('2 days 3 hours 4 minutes 5 seconds')
  })
})

describe('formatCoarseDurationSeconds', () => {
  it('rounds a static delay to one unit', () => {
    expect(formatCoarseDurationSeconds(0)).toBe('1 minute')
    expect(formatCoarseDurationSeconds(90)).toBe('2 minutes')
    expect(formatCoarseDurationSeconds(3_600)).toBe('1 hour')
    expect(formatCoarseDurationSeconds(7_200)).toBe('2 hours')
    expect(formatCoarseDurationSeconds(86_400)).toBe('1 day')
    expect(formatCoarseDurationSeconds(172_544)).toBe('2 days')
  })
})
