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

/** Empty unless set via VITE_ARKADE_DELEGATOR_* (Bitboard Fulmine delegator is opt-in). */
const DEFAULT_DELEGATORS: Record<ArkadeSupportedNetworkMode, string> = {
  mainnet: import.meta.env.VITE_ARKADE_DELEGATOR_MAINNET ?? '',
  testnet: import.meta.env.VITE_ARKADE_DELEGATOR_TESTNET ?? '',
  signet: import.meta.env.VITE_ARKADE_DELEGATOR_SIGNET ?? '',
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

export function isArkadeDelegatorConfigured(
  mode: ArkadeSupportedNetworkMode,
): boolean {
  return getArkadeEndpoints(mode).delegatorUrl.trim().length > 0
}

/** Default VTXO renewal threshold: 3 days (seconds), per Arkade docs. */
export const ARKADE_DEFAULT_VTXO_THRESHOLD_SECONDS = 259_200
