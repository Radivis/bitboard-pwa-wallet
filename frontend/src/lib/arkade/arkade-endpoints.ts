import { getEsploraUrl } from '@/lib/wallet/bitcoin-utils'
import type { NetworkMode } from '@/stores/walletStore'
import { getArkOperatorUrl } from '@/lib/arkade/arkade-operator-proxy'

/**
 * Live networks with a public Arkade operator in v1.
 * Bitcoin testnet4 is excluded — Arkade docs list mainnet, Mutinynet, and Signet only.
 */
export type ArkadeSupportedNetworkMode = 'mainnet' | 'signet'

export interface ArkadeEndpoints {
  arkServerUrl: string
  delegatorUrl: string
  esploraUrl: string
}

const OPERATOR_ENV_OVERRIDES: Record<ArkadeSupportedNetworkMode, string | undefined> = {
  mainnet: import.meta.env.VITE_ARKADE_OPERATOR_MAINNET,
  signet: import.meta.env.VITE_ARKADE_OPERATOR_SIGNET,
}

/** Empty unless set via VITE_ARKADE_DELEGATOR_* (Bitboard Fulmine delegator is opt-in). */
const DEFAULT_DELEGATORS: Record<ArkadeSupportedNetworkMode, string> = {
  mainnet: import.meta.env.VITE_ARKADE_DELEGATOR_MAINNET ?? '',
  signet: import.meta.env.VITE_ARKADE_DELEGATOR_SIGNET ?? '',
}

/** Reserved for regtest Fulmine (v2); not used in UI yet. */
export const ARKADE_REGTEST_ENDPOINTS_RESERVED = {
  arkServerUrl: import.meta.env.VITE_ARKADE_OPERATOR_REGTEST ?? '',
  delegatorUrl: import.meta.env.VITE_ARKADE_DELEGATOR_REGTEST ?? '',
} as const

export function isArkadeSupportedNetworkMode(
  mode: NetworkMode,
): mode is ArkadeSupportedNetworkMode {
  return mode === 'mainnet' || mode === 'signet'
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
    arkServerUrl: getArkOperatorUrl(mode, OPERATOR_ENV_OVERRIDES[mode]),
    delegatorUrl: DEFAULT_DELEGATORS[mode],
    esploraUrl: getEsploraUrl(mode, null),
  }
}

export function isArkadeDelegatorConfigured(
  mode: ArkadeSupportedNetworkMode,
): boolean {
  return getArkadeEndpoints(mode).delegatorUrl.trim().length > 0
}

const ARKADE_DELEGATOR_DISPLAY_FALLBACK = 'configured delegator'

function formatDelegatorUrlHostLabel(delegatorUrl: string): string {
  const trimmed = delegatorUrl.trim()
  if (!trimmed) return ARKADE_DELEGATOR_DISPLAY_FALLBACK
  try {
    const parsed = trimmed.includes('://') ? new URL(trimmed) : new URL(`https://${trimmed}`)
    return parsed.hostname || ARKADE_DELEGATOR_DISPLAY_FALLBACK
  } catch {
    return trimmed
  }
}

/** Human-readable delegator label derived from the configured delegator URL. */
export function getArkadeDelegatorDisplayLabel(mode: ArkadeSupportedNetworkMode): string {
  return formatDelegatorUrlHostLabel(getArkadeEndpoints(mode).delegatorUrl)
}

/** Default VTXO renewal threshold: 3 days (seconds), per Arkade docs. */
export const ARKADE_DEFAULT_VTXO_THRESHOLD_SECONDS = 259_200
