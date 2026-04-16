import { describe, expect, it } from 'vitest'
import { isValidTabScopedBroadcastMessage } from '@/lib/tab-scoped-broadcast-channel-sync'

describe('isValidTabScopedBroadcastMessage', () => {
  it('accepts well-formed payloads', () => {
    expect(
      isValidTabScopedBroadcastMessage({
        sourceTabId: 'abc-123',
        t: Date.now(),
      }),
    ).toBe(true)
  })

  it('rejects empty sourceTabId', () => {
    expect(
      isValidTabScopedBroadcastMessage({ sourceTabId: '   ', t: 1 }),
    ).toBe(false)
  })

  it('rejects missing or invalid fields', () => {
    expect(isValidTabScopedBroadcastMessage({})).toBe(false)
    expect(isValidTabScopedBroadcastMessage(null)).toBe(false)
    expect(
      isValidTabScopedBroadcastMessage({
        sourceTabId: 'x',
        t: NaN,
      }),
    ).toBe(false)
    expect(
      isValidTabScopedBroadcastMessage({
        sourceTabId: 1,
        t: 1,
      }),
    ).toBe(false)
  })
})
