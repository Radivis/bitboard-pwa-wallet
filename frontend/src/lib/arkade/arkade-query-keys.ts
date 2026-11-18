import type { ArkadeSupportedNetworkMode } from '@/lib/arkade/arkade-endpoints'
import type { ArkadeWalletKey } from '@/lib/arkade/arkade-session-scope'
import { WALLET_DB_QUERY_KEY_ROOT } from '@/lib/wallet/wallet-query-key-root'
import { appQueryClient } from '@/lib/shared/app-query-client'
import type { ArkadeVtxoOutpoint } from '@/workers/arkade-api'
import { arkadeVtxoOutpointCacheKey } from '@/workers/arkade-api'

/** Sentinel segment for disabled Arkade queries (wallet/network not ready). */
export const ARKADE_QUERY_DISABLED = 'disabled' as const

function arkadeWalletKeyPrefix(walletKey: ArkadeWalletKey) {
  return [
    ...WALLET_DB_QUERY_KEY_ROOT,
    'arkade',
    walletKey.walletId,
    walletKey.networkMode,
    walletKey.arkadeAccountId,
  ] as const
}

export function arkadeDisabledQueryKey(scope: string) {
  return [...WALLET_DB_QUERY_KEY_ROOT, 'arkade', scope, ARKADE_QUERY_DISABLED] as const
}

export const arkadeBalanceQueryKey = (walletKey: ArkadeWalletKey) =>
  [
    ...arkadeWalletKeyPrefix(walletKey),
    'balance',
  ] as const

export const arkadeHistoryQueryKey = (walletKey: ArkadeWalletKey) =>
  [
    ...arkadeWalletKeyPrefix(walletKey),
    'history',
  ] as const

export const arkadeReceiveGapQueryKey = (walletKey: ArkadeWalletKey) =>
  [
    ...arkadeWalletKeyPrefix(walletKey),
    'receive-gap',
  ] as const

export const arkadeAddressQueryKey = (walletKey: ArkadeWalletKey) =>
  [
    ...arkadeWalletKeyPrefix(walletKey),
    'address',
  ] as const

export const arkadeBoardingAddressQueryKey = (walletKey: ArkadeWalletKey) =>
  [
    ...arkadeWalletKeyPrefix(walletKey),
    'boarding-address',
  ] as const

export const arkadeBoardingStatusQueryKey = (walletKey: ArkadeWalletKey) =>
  [
    ...arkadeWalletKeyPrefix(walletKey),
    'boarding-status',
  ] as const

/**
 * Delegate info comes from the open session (account `delegatorUrl`, else env default).
 * Key is network-only today because v1 keeps one active account per network.
 */
export const arkadeDelegateInfoQueryKey = (
  networkMode: ArkadeSupportedNetworkMode,
) => [...WALLET_DB_QUERY_KEY_ROOT, 'arkade', 'delegator', networkMode, 'info'] as const

export const arkadeVtxoExpiryQueryKey = (walletKey: ArkadeWalletKey) =>
  [
    ...arkadeWalletKeyPrefix(walletKey),
    'vtxo-expiry',
  ] as const

export const arkadeOperatorScheduledSessionQueryKey = (walletKey: ArkadeWalletKey) =>
  [
    ...arkadeWalletKeyPrefix(walletKey),
    'operator-scheduled-session',
  ] as const

export const arkadeVtxoListQueryKey = (walletKey: ArkadeWalletKey) =>
  [
    ...arkadeWalletKeyPrefix(walletKey),
    'vtxo-list',
  ] as const

export const arkadeExitCandidatesQueryKey = (walletKey: ArkadeWalletKey) =>
  [
    ...arkadeWalletKeyPrefix(walletKey),
    'exit-candidates',
  ] as const

export const arkadeBumperInfoQueryKey = (walletKey: ArkadeWalletKey) =>
  [
    ...arkadeWalletKeyPrefix(walletKey),
    'bumper',
  ] as const

export const arkadeUnilateralExitTimelockQueryKey = (walletKey: ArkadeWalletKey) =>
  [
    ...arkadeWalletKeyPrefix(walletKey),
    'unilateral-exit-timelock',
  ] as const

export const arkadeBumperAddressQueryKey = (walletKey: ArkadeWalletKey) =>
  [
    ...arkadeWalletKeyPrefix(walletKey),
    'bumper-address',
  ] as const

export const arkadeRecoverableVtxoFeeQueryKey = (walletKey: ArkadeWalletKey) =>
  [
    ...arkadeWalletKeyPrefix(walletKey),
    'recoverable-vtxo-fee',
  ] as const

export const arkadeSignerMigrationPartialResultQueryKey = (
  walletKey: ArkadeWalletKey,
  previousSignerPkHex: string,
) =>
  [
    ...arkadeWalletKeyPrefix(walletKey),
    'signer-migration-partial',
    previousSignerPkHex,
  ] as const

export const arkadeCollaborativeExitFeeQueryKey = (
  walletKey: ArkadeWalletKey,
  destinationAddress: string,
  amountSats: number | undefined,
) =>
  [
    ...arkadeWalletKeyPrefix(walletKey),
    'exit-fee',
    'collaborative',
    destinationAddress,
    amountSats ?? 'full',
  ] as const

export const arkadeUnilateralExitsInProgressQueryKey = (walletKey: ArkadeWalletKey) =>
  [
    ...arkadeWalletKeyPrefix(walletKey),
    'unilateral-exits-in-progress',
  ] as const

export const arkadeAutonomousModeStatusQueryKey = (walletKey: ArkadeWalletKey) =>
  [
    ...arkadeWalletKeyPrefix(walletKey),
    'autonomous-mode-status',
  ] as const

export const arkadeOperatorTrustStatusQueryKey = (walletKey: ArkadeWalletKey) =>
  [
    ...arkadeWalletKeyPrefix(walletKey),
    'operator-trust-status',
  ] as const

export const arkadeOperatorConfigDiffQueryKey = (walletKey: ArkadeWalletKey) =>
  [
    ...arkadeWalletKeyPrefix(walletKey),
    'operator-config-diff',
  ] as const

export const arkadeUnilateralExitCompletionFeeQueryKey = (
  walletKey: ArkadeWalletKey,
  vtxoOutpoints: ArkadeVtxoOutpoint[],
  destinationAddress: string,
  feeRateSatPerVb: number,
) =>
  [
    ...arkadeWalletKeyPrefix(walletKey),
    'exit-fee',
    'unilateral-completion',
    arkadeVtxoOutpointCacheKey(vtxoOutpoints),
    destinationAddress,
    feeRateSatPerVb,
  ] as const

export const arkadeUnilateralExitTopologyScopeKey = (walletKey: ArkadeWalletKey) =>
  [
    ...arkadeWalletKeyPrefix(walletKey),
    'unilateral-exit-topology',
  ] as const

export const arkadeUnilateralExitTopologyQueryKey = (
  walletKey: ArkadeWalletKey,
  vtxoOutpoints: ArkadeVtxoOutpoint[],
) =>
  [
    ...arkadeUnilateralExitTopologyScopeKey(walletKey),
    arkadeVtxoOutpointCacheKey(vtxoOutpoints),
  ] as const

export const arkadeUnilateralExitBatchEstimateQueryKey = (
  walletKey: ArkadeWalletKey,
  vtxoOutpoints: ArkadeVtxoOutpoint[],
  feeRateSatPerVb: number,
) =>
  [
    ...arkadeWalletKeyPrefix(walletKey),
    'exit-fee',
    'unilateral-batch',
    arkadeVtxoOutpointCacheKey(vtxoOutpoints),
    feeRateSatPerVb,
  ] as const

export const arkadeUnilateralExitProgressQueryKey = (
  walletKey: ArkadeWalletKey,
  vtxoOutpoints: ArkadeVtxoOutpoint[],
) =>
  [
    ...arkadeWalletKeyPrefix(walletKey),
    'unilateral-exit-progress',
    arkadeVtxoOutpointCacheKey(vtxoOutpoints),
  ] as const

export function removeArkadeDashboardQueries(): void {
  appQueryClient.removeQueries({
    queryKey: [...WALLET_DB_QUERY_KEY_ROOT, 'arkade'],
  })
}
