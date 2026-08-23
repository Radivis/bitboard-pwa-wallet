import { describe, expect, it } from 'vitest'
import {
  ARKADE_SESSION_NOT_OPEN_ERROR,
  ARKADE_SESSION_SCOPE_MISMATCH_ERROR,
  arkadeWalletScopesEqual,
  assertArkadeOpenSessionMatchesScope,
} from '@/lib/arkade/arkade-session-scope'

const openSession = {
  walletId: 1,
  networkMode: 'regtest',
  connectionId: 'conn-1',
}

describe('arkadeWalletScopesEqual', () => {
  it('returns false when either side is null', () => {
    expect(arkadeWalletScopesEqual(null, openSession)).toBe(false)
    expect(arkadeWalletScopesEqual(openSession, null)).toBe(false)
    expect(arkadeWalletScopesEqual(null, null)).toBe(false)
  })

  it('returns true for matching scopes', () => {
    expect(arkadeWalletScopesEqual(openSession, { ...openSession })).toBe(true)
  })

  it('returns false when any field differs', () => {
    expect(arkadeWalletScopesEqual(openSession, { ...openSession, walletId: 2 })).toBe(false)
    expect(
      arkadeWalletScopesEqual(openSession, { ...openSession, networkMode: 'signet' }),
    ).toBe(false)
    expect(
      arkadeWalletScopesEqual(openSession, { ...openSession, connectionId: 'conn-2' }),
    ).toBe(false)
  })
})

describe('assertArkadeOpenSessionMatchesScope', () => {
  it('throws when no session is open', () => {
    expect(() => assertArkadeOpenSessionMatchesScope(null, openSession)).toThrow(
      ARKADE_SESSION_NOT_OPEN_ERROR,
    )
  })

  it('throws when walletId differs', () => {
    expect(() =>
      assertArkadeOpenSessionMatchesScope(openSession, {
        ...openSession,
        walletId: 2,
      }),
    ).toThrow(ARKADE_SESSION_SCOPE_MISMATCH_ERROR)
  })

  it('throws when networkMode differs', () => {
    expect(() =>
      assertArkadeOpenSessionMatchesScope(openSession, {
        ...openSession,
        networkMode: 'signet',
      }),
    ).toThrow(ARKADE_SESSION_SCOPE_MISMATCH_ERROR)
  })

  it('throws when connectionId differs', () => {
    expect(() =>
      assertArkadeOpenSessionMatchesScope(openSession, {
        ...openSession,
        connectionId: 'conn-2',
      }),
    ).toThrow(ARKADE_SESSION_SCOPE_MISMATCH_ERROR)
  })

  it('accepts a matching session', () => {
    expect(() =>
      assertArkadeOpenSessionMatchesScope(openSession, { ...openSession }),
    ).not.toThrow()
  })
})
