import type { ArkadeSupportedNetworkMode } from '@/lib/arkade/arkade-endpoints'
import { WALLET_DB_QUERY_KEY_ROOT } from '@/lib/wallet/wallet-query-key-root'
import { appQueryClient } from '@/lib/shared/app-query-client'

export const arkadeBalanceQueryKey = (
  walletId: number,
  networkMode: ArkadeSupportedNetworkMode,
) => [...WALLET_DB_QUERY_KEY_ROOT, 'arkade', walletId, networkMode, 'balance'] as const

export const arkadeHistoryQueryKey = (
  walletId: number,
  networkMode: ArkadeSupportedNetworkMode,
) => [...WALLET_DB_QUERY_KEY_ROOT, 'arkade', walletId, networkMode, 'history'] as const

export const arkadeAddressQueryKey = (
  walletId: number,
  networkMode: ArkadeSupportedNetworkMode,
) => [...WALLET_DB_QUERY_KEY_ROOT, 'arkade', walletId, networkMode, 'address'] as const

export const arkadeBoardingAddressQueryKey = (
  walletId: number,
  networkMode: ArkadeSupportedNetworkMode,
) =>
  [...WALLET_DB_QUERY_KEY_ROOT, 'arkade', walletId, networkMode, 'boarding-address'] as const

export const arkadeBoardingStatusQueryKey = (
  walletId: number,
  networkMode: ArkadeSupportedNetworkMode,
) =>
  [...WALLET_DB_QUERY_KEY_ROOT, 'arkade', walletId, networkMode, 'boarding-status'] as const

export const arkadeDelegateInfoQueryKey = (
  networkMode: ArkadeSupportedNetworkMode,
) => [...WALLET_DB_QUERY_KEY_ROOT, 'arkade', 'delegator', networkMode, 'info'] as const

export const arkadeExitCandidatesQueryKey = (
  walletId: number,
  networkMode: ArkadeSupportedNetworkMode,
) =>
  [...WALLET_DB_QUERY_KEY_ROOT, 'arkade', walletId, networkMode, 'exit-candidates'] as const

export const arkadeBumperInfoQueryKey = (
  walletId: number,
  networkMode: ArkadeSupportedNetworkMode,
) => [...WALLET_DB_QUERY_KEY_ROOT, 'arkade', walletId, networkMode, 'bumper'] as const

export const arkadeCollaborativeExitFeeQueryKey = (
  walletId: number,
  networkMode: ArkadeSupportedNetworkMode,
  destinationAddress: string,
  amountSats: number | undefined,
) =>
  [
    ...WALLET_DB_QUERY_KEY_ROOT,
    'arkade',
    walletId,
    networkMode,
    'exit-fee',
    'collaborative',
    destinationAddress,
    amountSats ?? 'full',
  ] as const

export const arkadeUnilateralExitFeeQueryKey = (
  walletId: number,
  networkMode: ArkadeSupportedNetworkMode,
  txid: string,
  vout: number,
) =>
  [
    ...WALLET_DB_QUERY_KEY_ROOT,
    'arkade',
    walletId,
    networkMode,
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
