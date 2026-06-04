import type { ArkadeSupportedNetworkMode } from '@/lib/arkade/arkade-endpoints'

export const ARKADE_SUPPORTED_NETWORK_MODES: readonly ArkadeSupportedNetworkMode[] =
  ['mainnet', 'testnet', 'signet'] as const

export type {
  ArkadeConnectionSnapshot,
  StoredArkadeWalletState,
} from '@/lib/wallet/wallet-domain-types'
