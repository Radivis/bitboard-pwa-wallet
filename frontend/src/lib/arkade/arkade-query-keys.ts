import type { ArkadeSupportedNetworkMode } from '@/lib/arkade/arkade-endpoints'
import { WALLET_DB_QUERY_KEY_ROOT } from '@/lib/wallet/wallet-query-key-root'
import { appQueryClient } from '@/lib/shared/app-query-client'

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
