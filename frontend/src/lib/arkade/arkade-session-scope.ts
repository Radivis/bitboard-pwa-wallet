import type { NetworkMode } from '@/stores/walletStore'

export type ArkadeWalletScope = {
  walletId: number
  networkMode: NetworkMode
  arkadeAccountId: string
}

export const ARKADE_SESSION_NOT_OPEN_ERROR = 'Arkade session is not open'
export const ARKADE_SESSION_SCOPE_MISMATCH_ERROR =
  'Arkade session scope does not match the open wallet'
export const ARKADE_PERSIST_SCOPE_CHANGED_ERROR =
  'Arkade persistence flush was skipped (session scope changed)'

export function arkadeWalletScopeKey(
  scope: Pick<ArkadeWalletScope, 'walletId' | 'networkMode' | 'arkadeAccountId'>,
): string {
  return `${scope.walletId}:${scope.networkMode}:${scope.arkadeAccountId}`
}

export function arkadeWalletScopesEqual(
  left: ArkadeWalletScope | null | undefined,
  right: ArkadeWalletScope | null | undefined,
): boolean {
  if (left == null || right == null) {
    return false
  }
  return arkadeWalletScopeKey(left) === arkadeWalletScopeKey(right)
}

export function assertArkadeOpenSessionMatchesScope(
  activeSession: ArkadeWalletScope | null,
  requested: ArkadeWalletScope,
): void {
  if (activeSession == null) {
    throw new Error(ARKADE_SESSION_NOT_OPEN_ERROR)
  }
  if (!arkadeWalletScopesEqual(activeSession, requested)) {
    throw new Error(ARKADE_SESSION_SCOPE_MISMATCH_ERROR)
  }
}

/**
 * Persistence must target the wallet that owns the open session.
 * A newly activated wallet can still see the previous account id; writing that
 * account into the new wallet throws "Unknown Arkade account".
 */
export function arkadeOpenSessionMatchesSaveTarget(
  activeSession: Pick<ArkadeWalletScope, 'walletId' | 'arkadeAccountId'> | null,
  target: Pick<ArkadeWalletScope, 'walletId' | 'arkadeAccountId'>,
): boolean {
  if (activeSession == null) {
    return false
  }
  return (
    activeSession.walletId === target.walletId &&
    activeSession.arkadeAccountId === target.arkadeAccountId
  )
}

/**
 * A persistence flush may write only when the session that started the work is still open.
 * A null stamp means the work began with no session and must not adopt a later one.
 */
export function stampedPersistScopeStillMatchesOpenSession(
  scopeAtStart: Pick<ArkadeWalletScope, 'walletId' | 'arkadeAccountId'> | null,
  openSession: Pick<ArkadeWalletScope, 'walletId' | 'arkadeAccountId'> | null,
): boolean {
  if (scopeAtStart == null) {
    return false
  }
  return arkadeOpenSessionMatchesSaveTarget(openSession, scopeAtStart)
}
