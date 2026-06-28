import { getEsploraUrl } from '@/lib/wallet/bitcoin-utils'
import type { NetworkMode } from '@/stores/walletStore'
import { getArkOperatorUrl } from '@/lib/arkade/arkade-operator-proxy'

/**
 * Networks with an Arkade operator in v1 (live mainnet/signet, local regtest for dev/E2E).
 */
export type ArkadeSupportedNetworkMode = 'mainnet' | 'signet' | 'regtest'

export interface ArkadeEndpoints {
  arkServerUrl: string
  delegatorUrl: string
  esploraUrl: string
}

const REGTEST_OPERATOR_DEFAULT = 'http://localhost:7070'

const OPERATOR_ENV_OVERRIDES: Record<ArkadeSupportedNetworkMode, string | undefined> = {
  mainnet: import.meta.env.VITE_ARKADE_OPERATOR_MAINNET,
  signet: import.meta.env.VITE_ARKADE_OPERATOR_SIGNET,
  regtest: import.meta.env.VITE_ARKADE_OPERATOR_REGTEST,
}

/** Empty unless set via VITE_ARKADE_DELEGATOR_* (Bitboard Fulmine delegator is opt-in). */
const DEFAULT_DELEGATORS: Record<ArkadeSupportedNetworkMode, string> = {
  mainnet: import.meta.env.VITE_ARKADE_DELEGATOR_MAINNET ?? '',
  signet: import.meta.env.VITE_ARKADE_DELEGATOR_SIGNET ?? '',
  regtest: import.meta.env.VITE_ARKADE_DELEGATOR_REGTEST ?? '',
}

export function isArkadeSupportedNetworkMode(
  mode: NetworkMode,
): mode is ArkadeSupportedNetworkMode {
  return mode === 'mainnet' || mode === 'signet' || mode === 'regtest'
}

export function networkModeToArkadeIsMainnet(
  mode: ArkadeSupportedNetworkMode,
): boolean {
  return mode === 'mainnet'
}

export function getArkadeEndpoints(
  mode: ArkadeSupportedNetworkMode,
): ArkadeEndpoints {
  const regtestOperator =
    OPERATOR_ENV_OVERRIDES.regtest?.trim() || REGTEST_OPERATOR_DEFAULT
  const operatorOverride =
    mode === 'regtest' ? regtestOperator : OPERATOR_ENV_OVERRIDES[mode]

  return {
    arkServerUrl: getArkOperatorUrl(mode, operatorOverride),
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
