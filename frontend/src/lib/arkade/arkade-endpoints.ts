import type { NetworkMode } from '@/stores/walletStore'

/** Live networks with Arkade support in v1. */
export type ArkadeSupportedNetworkMode = 'mainnet' | 'testnet' | 'signet'

export interface ArkadeEndpoints {
  arkServerUrl: string
  delegatorUrl: string
  esploraUrl: string
}

const DEFAULT_OPERATORS: Record<ArkadeSupportedNetworkMode, string> = {
  mainnet:
    import.meta.env.VITE_ARKADE_OPERATOR_MAINNET ?? 'https://arkade.computer',
  testnet:
    import.meta.env.VITE_ARKADE_OPERATOR_TESTNET ??
    'https://testnet.arkade.computer',
  signet:
    import.meta.env.VITE_ARKADE_OPERATOR_SIGNET ??
    'https://mutinynet.arkade.sh',
}

const DEFAULT_DELEGATORS: Record<ArkadeSupportedNetworkMode, string> = {
  mainnet:
    import.meta.env.VITE_ARKADE_DELEGATOR_MAINNET ??
    'https://delegator-mainnet.bitboard-wallet.com',
  testnet:
    import.meta.env.VITE_ARKADE_DELEGATOR_TESTNET ??
    'https://delegator-testnet4.bitboard-wallet.com',
  signet:
    import.meta.env.VITE_ARKADE_DELEGATOR_SIGNET ??
    'https://delegator-mutinynet.bitboard-wallet.com',
}

const DEFAULT_ESPLORA: Record<ArkadeSupportedNetworkMode, string> = {
  mainnet: 'https://mempool.space/api',
  testnet: 'https://mempool.space/testnet4/api',
  signet: 'https://mutinynet.com/api',
}

/** Reserved for regtest Fulmine (v2); not used in UI yet. */
export const ARKADE_REGTEST_ENDPOINTS_RESERVED = {
  arkServerUrl: import.meta.env.VITE_ARKADE_OPERATOR_REGTEST ?? '',
  delegatorUrl: import.meta.env.VITE_ARKADE_DELEGATOR_REGTEST ?? '',
} as const

export function isArkadeSupportedNetworkMode(
  mode: NetworkMode,
): mode is ArkadeSupportedNetworkMode {
  return mode === 'mainnet' || mode === 'testnet' || mode === 'signet'
}

export function networkModeToArkadeIsMainnet(
  mode: ArkadeSupportedNetworkMode,
): boolean {
  return mode === 'mainnet'
}

export function getArkadeEndpoints(
  mode: ArkadeSupportedNetworkMode,
): ArkadeEndpoints {
  return {
    arkServerUrl: DEFAULT_OPERATORS[mode],
    delegatorUrl: DEFAULT_DELEGATORS[mode],
    esploraUrl: DEFAULT_ESPLORA[mode],
  }
}

/** Default VTXO renewal threshold: 3 days (seconds), per Arkade docs. */
export const ARKADE_DEFAULT_VTXO_THRESHOLD_SECONDS = 259_200
