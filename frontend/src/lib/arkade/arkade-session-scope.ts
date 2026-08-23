import type { NetworkMode } from '@/stores/walletStore'

export type ArkadeWalletScope = {
  walletId: number
  networkMode: NetworkMode
  connectionId: string
}

export const ARKADE_SESSION_NOT_OPEN_ERROR = 'Arkade session is not open'
export const ARKADE_SESSION_SCOPE_MISMATCH_ERROR =
  'Arkade session scope does not match the open wallet'

export function arkadeWalletScopeKey(
  scope: Pick<ArkadeWalletScope, 'walletId' | 'networkMode' | 'connectionId'>,
): string {
  return `${scope.walletId}:${scope.networkMode}:${scope.connectionId}`
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
