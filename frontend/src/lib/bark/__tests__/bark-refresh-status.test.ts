import { describe, expect, it } from 'vitest'
import { BARK_EMERGENCY_EXIT_BLOCKS_ACTION } from '@/lib/bark/emergency-exit-blocks-action'
import {
  barkRefreshWarningText,
  readBarkNextRefreshSchedule,
  readBarkRefreshStatus,
} from '@/lib/bark/bark-refresh-status'

describe('bark refresh status', () => {
  it('reads exit_blocked and shows the cancel sentence', () => {
    expect(readBarkRefreshStatus('exit_blocked')).toBe('exit_blocked')
    expect(barkRefreshWarningText('exit_blocked')).toBe(BARK_EMERGENCY_EXIT_BLOCKS_ACTION)
    expect(barkRefreshWarningText('warning')).toBe('Bark could not schedule a refresh.')
  })
})

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
