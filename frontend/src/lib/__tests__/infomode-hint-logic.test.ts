import { describe, expect, it } from 'vitest'
import {
  APP_LAST_OPENED_REMINDER_AFTER_MS,
  getInfomodeHintKind,
} from '@/lib/infomode-hint-logic'

describe('getInfomodeHintKind', () => {
  const now = new Date('2025-06-15T12:00:00.000Z').getTime()

  it('returns intro when there is no prior open', () => {
    expect(getInfomodeHintKind(null, now)).toBe('intro')
  })

  it('returns none when last open is within the reminder window', () => {
    const last = new Date(now - APP_LAST_OPENED_REMINDER_AFTER_MS + 60_000)
    expect(getInfomodeHintKind(last, now)).toBe('none')
  })

  it('returns reminder when last open is at least seven days ago', () => {
    const last = new Date(now - APP_LAST_OPENED_REMINDER_AFTER_MS)
    expect(getInfomodeHintKind(last, now)).toBe('reminder')
  })

  it('returns reminder when last open is older than seven days', () => {
    const last = new Date(now - APP_LAST_OPENED_REMINDER_AFTER_MS - 86_400_000)
    expect(getInfomodeHintKind(last, now)).toBe('reminder')
  })
})
