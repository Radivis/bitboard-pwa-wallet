import type { ArkadeSupportedNetworkMode } from '@/lib/arkade/arkade-endpoints'
import { WALLET_DB_QUERY_KEY_ROOT } from '@/lib/wallet/wallet-query-key-root'
import { appQueryClient } from '@/lib/shared/app-query-client'

/** Sentinel segment for disabled Arkade queries (wallet/network not ready). */
export const ARKADE_QUERY_DISABLED = 'disabled' as const

export function arkadeDisabledQueryKey(scope: string) {
  return [...WALLET_DB_QUERY_KEY_ROOT, 'arkade', scope, ARKADE_QUERY_DISABLED] as const
}

export const arkadeBalanceQueryKey = (
  walletId: number,
  networkMode: ArkadeSupportedNetworkMode,
  connectionId: string,
) =>
  [
    ...WALLET_DB_QUERY_KEY_ROOT,
    'arkade',
    walletId,
    networkMode,
    connectionId,
    'balance',
  ] as const

export const arkadeHistoryQueryKey = (
  walletId: number,
  networkMode: ArkadeSupportedNetworkMode,
  connectionId: string,
) =>
  [
    ...WALLET_DB_QUERY_KEY_ROOT,
    'arkade',
    walletId,
    networkMode,
    connectionId,
    'history',
  ] as const

export const arkadeAddressQueryKey = (
  walletId: number,
  networkMode: ArkadeSupportedNetworkMode,
  connectionId: string,
) =>
  [
    ...WALLET_DB_QUERY_KEY_ROOT,
    'arkade',
    walletId,
    networkMode,
    connectionId,
    'address',
  ] as const

export const arkadeBoardingAddressQueryKey = (
  walletId: number,
  networkMode: ArkadeSupportedNetworkMode,
  connectionId: string,
) =>
  [
    ...WALLET_DB_QUERY_KEY_ROOT,
    'arkade',
    walletId,
    networkMode,
    connectionId,
    'boarding-address',
  ] as const

export const arkadeBoardingStatusQueryKey = (
  walletId: number,
  networkMode: ArkadeSupportedNetworkMode,
  connectionId: string,
) =>
  [
    ...WALLET_DB_QUERY_KEY_ROOT,
    'arkade',
    walletId,
    networkMode,
    connectionId,
    'boarding-status',
  ] as const

/** Delegator URL/fee are network-scoped (env per network), not per wallet connection. */
export const arkadeDelegateInfoQueryKey = (
  networkMode: ArkadeSupportedNetworkMode,
) => [...WALLET_DB_QUERY_KEY_ROOT, 'arkade', 'delegator', networkMode, 'info'] as const

export const arkadeVtxoExpiryQueryKey = (
  walletId: number,
  networkMode: ArkadeSupportedNetworkMode,
  connectionId: string,
) =>
  [
    ...WALLET_DB_QUERY_KEY_ROOT,
    'arkade',
    walletId,
    networkMode,
    connectionId,
    'vtxo-expiry',
  ] as const

export const arkadeVtxoListQueryKey = (
  walletId: number,
  networkMode: ArkadeSupportedNetworkMode,
  connectionId: string,
) =>
  [
    ...WALLET_DB_QUERY_KEY_ROOT,
    'arkade',
    walletId,
    networkMode,
    connectionId,
    'vtxo-list',
  ] as const

export const arkadeExitCandidatesQueryKey = (
  walletId: number,
  networkMode: ArkadeSupportedNetworkMode,
  connectionId: string,
) =>
  [
    ...WALLET_DB_QUERY_KEY_ROOT,
    'arkade',
    walletId,
    networkMode,
    connectionId,
    'exit-candidates',
  ] as const

export const arkadeBumperInfoQueryKey = (
  walletId: number,
  networkMode: ArkadeSupportedNetworkMode,
  connectionId: string,
) =>
  [
    ...WALLET_DB_QUERY_KEY_ROOT,
    'arkade',
    walletId,
    networkMode,
    connectionId,
    'bumper',
  ] as const

export const arkadeRecoverableVtxoFeeQueryKey = (
  walletId: number,
  networkMode: ArkadeSupportedNetworkMode,
  connectionId: string,
) =>
  [
    ...WALLET_DB_QUERY_KEY_ROOT,
    'arkade',
    walletId,
    networkMode,
    connectionId,
    'recoverable-vtxo-fee',
  ] as const

export const arkadeSignerMigrationPartialResultQueryKey = (
  walletId: number,
  networkMode: ArkadeSupportedNetworkMode,
  connectionId: string,
  previousSignerPkHex: string,
) =>
  [
    ...WALLET_DB_QUERY_KEY_ROOT,
    'arkade',
    walletId,
    networkMode,
    connectionId,
    'signer-migration-partial',
    previousSignerPkHex,
  ] as const

export const arkadeCollaborativeExitFeeQueryKey = (
  walletId: number,
  networkMode: ArkadeSupportedNetworkMode,
  connectionId: string,
  destinationAddress: string,
  amountSats: number | undefined,
) =>
  [
    ...WALLET_DB_QUERY_KEY_ROOT,
    'arkade',
    walletId,
    networkMode,
    connectionId,
    'exit-fee',
    'collaborative',
    destinationAddress,
    amountSats ?? 'full',
  ] as const

export const arkadeUnilateralExitsInProgressQueryKey = (
  walletId: number,
  networkMode: ArkadeSupportedNetworkMode,
  connectionId: string,
) =>
  [
    ...WALLET_DB_QUERY_KEY_ROOT,
    'arkade',
    walletId,
    networkMode,
    connectionId,
    'unilateral-exits-in-progress',
  ] as const

export const arkadeAutonomousModeStatusQueryKey = (
  walletId: number,
  networkMode: ArkadeSupportedNetworkMode,
  connectionId: string,
) =>
  [
    ...WALLET_DB_QUERY_KEY_ROOT,
    'arkade',
    walletId,
    networkMode,
    connectionId,
    'autonomous-mode-status',
  ] as const

export const arkadeUnilateralExitCompletionFeeQueryKey = (
  walletId: number,
  networkMode: ArkadeSupportedNetworkMode,
  connectionId: string,
  vtxoTxids: string[],
  destinationAddress: string,
  feeRateSatPerVb: number,
) =>
  [
    ...WALLET_DB_QUERY_KEY_ROOT,
    'arkade',
    walletId,
    networkMode,
    connectionId,
    'exit-fee',
    'unilateral-completion',
    [...vtxoTxids].sort().join(','),
    destinationAddress,
    feeRateSatPerVb,
  ] as const

export const arkadeUnilateralExitFeeQueryKey = (
  walletId: number,
  networkMode: ArkadeSupportedNetworkMode,
  connectionId: string,
  txid: string,
  vout: number,
) =>
  [
    ...WALLET_DB_QUERY_KEY_ROOT,
    'arkade',
    walletId,
    networkMode,
    connectionId,
    'exit-fee',
    'unilateral',
    txid,
    vout,
  ] as const

export function removeArkadeDashboardQueries(): void {
  appQueryClient.removeQueries({
    queryKey: [...WALLET_DB_QUERY_KEY_ROOT, 'arkade'],
  })
}
