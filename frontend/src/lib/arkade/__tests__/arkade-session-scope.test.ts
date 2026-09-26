import { describe, expect, it } from 'vitest'
import {
  ARKADE_SESSION_NOT_OPEN_ERROR,
  ARKADE_SESSION_SCOPE_MISMATCH_ERROR,
  arkadeWalletScopesEqual,
  arkadeOpenSessionMatchesSaveTarget,
  assertArkadeOpenSessionMatchesScope,
  stampedPersistScopeStillMatchesOpenSession,
} from '@/lib/arkade/arkade-session-scope'

const openSession = {
  walletId: 1,
  networkMode: 'regtest',
  arkadeAccountId: 'conn-1',
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
      arkadeWalletScopesEqual(openSession, { ...openSession, arkadeAccountId: 'conn-2' }),
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

  it('throws when arkadeAccountId differs', () => {
    expect(() =>
      assertArkadeOpenSessionMatchesScope(openSession, {
        ...openSession,
        arkadeAccountId: 'conn-2',
      }),
    ).toThrow(ARKADE_SESSION_SCOPE_MISMATCH_ERROR)
  })

  it('accepts a matching session', () => {
    expect(() =>
      assertArkadeOpenSessionMatchesScope(openSession, { ...openSession }),
    ).not.toThrow()
  })
})

describe('arkadeOpenSessionMatchesSaveTarget', () => {
  it('rejects a save aimed at a different wallet than the open session', () => {
    expect(
      arkadeOpenSessionMatchesSaveTarget(openSession, {
        walletId: 2,
        arkadeAccountId: openSession.arkadeAccountId,
      }),
    ).toBe(false)
  })

  it('rejects a save when no session is open', () => {
    expect(
      arkadeOpenSessionMatchesSaveTarget(null, {
        walletId: openSession.walletId,
        arkadeAccountId: openSession.arkadeAccountId,
      }),
    ).toBe(false)
  })

  it('accepts a save for the open session wallet and account', () => {
    expect(
      arkadeOpenSessionMatchesSaveTarget(openSession, {
        walletId: openSession.walletId,
        arkadeAccountId: openSession.arkadeAccountId,
      }),
    ).toBe(true)
  })
})

describe('stampedPersistScopeStillMatchesOpenSession', () => {
  const scopeAtStart = {
    walletId: openSession.walletId,
    arkadeAccountId: openSession.arkadeAccountId,
  }

  it('refuses a flush that started with no session', () => {
    expect(stampedPersistScopeStillMatchesOpenSession(null, openSession)).toBe(false)
  })

  it('refuses a flush after the open session wallet changes', () => {
    expect(
      stampedPersistScopeStillMatchesOpenSession(scopeAtStart, {
        ...openSession,
        walletId: 2,
      }),
    ).toBe(false)
  })

  it('allows a flush while the stamped wallet and account are still open', () => {
    expect(stampedPersistScopeStillMatchesOpenSession(scopeAtStart, openSession)).toBe(true)
  })
})
