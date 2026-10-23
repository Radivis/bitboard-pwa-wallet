import { describe, expect, it } from 'vitest'
import { readBarkNextRefreshSchedule } from '@/lib/bark/bark-refresh-status'

describe('readBarkNextRefreshSchedule', () => {
  it('reads the tip and the next refresh height', () => {
    expect(readBarkNextRefreshSchedule('{"tipHeight":1000,"nextRefreshHeight":1101}')).toEqual({
      tipHeight: 1000,
      nextRefreshHeight: 1101,
    })
  })

  it('reads null when Bark has no next refresh height', () => {
    expect(readBarkNextRefreshSchedule('null')).toBeNull()
  })

  it('rejects a payload that is not the schedule contract', () => {
    expect(() => readBarkNextRefreshSchedule(42)).toThrow('Bark next refresh schedule is invalid')
    expect(() => readBarkNextRefreshSchedule('{"tipHeight":1000}')).toThrow(
      'Bark next refresh schedule is invalid',
    )
    expect(() =>
      readBarkNextRefreshSchedule('{"tipHeight":-1,"nextRefreshHeight":1101}'),
    ).toThrow('Bark next refresh schedule is invalid')
    expect(() =>
      readBarkNextRefreshSchedule('{"tipHeight":1000.5,"nextRefreshHeight":1101}'),
    ).toThrow('Bark next refresh schedule is invalid')
  })
})
