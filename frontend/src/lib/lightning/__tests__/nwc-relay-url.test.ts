import { describe, it, expect } from 'vitest'
import { normalizeNwcRelayUrl } from '@/lib/lightning/nwc-relay-url'

describe('normalizeNwcRelayUrl', () => {
  it('appends /v1 for Alby NWC relays without a path', () => {
    expect(normalizeNwcRelayUrl('wss://relay.getalby.com')).toBe(
      'wss://relay.getalby.com/v1',
    )
    expect(normalizeNwcRelayUrl('wss://relay.getalby.com/')).toBe(
      'wss://relay.getalby.com/v1',
    )
    expect(normalizeNwcRelayUrl('wss://relay2.getalby.com')).toBe(
      'wss://relay2.getalby.com/v1',
    )
  })

  it('leaves Alby relay URLs unchanged when /v1 is already present', () => {
    expect(normalizeNwcRelayUrl('wss://relay.getalby.com/v1')).toBe(
      'wss://relay.getalby.com/v1',
    )
  })

  it('does not change non-Alby relays', () => {
    expect(normalizeNwcRelayUrl('wss://relay.example.com')).toBe(
      'wss://relay.example.com',
    )
    expect(normalizeNwcRelayUrl('wss://relay.example.com/custom')).toBe(
      'wss://relay.example.com/custom',
    )
  })
})
