import type { ArkadeSupportedNetworkMode } from '@/lib/arkade/arkade-endpoints'
import { normalizeEsploraBaseUrl } from '../esplora/esplora-service-whitelist'

/** Same-origin path prefix for the Arkade operator proxy (no trailing slash). */
export const ARKADE_OPERATOR_PROXY_PREFIX = '/api/arkade/operator'

/**
 * Official public Arkade operators (see Arkade developer resources).
 * Bitcoin testnet4 has no public operator — only mainnet and signet/Mutinynet are supported in the UI.
 */
export const ARKADE_OPERATOR_UPSTREAM_BASES: Record<ArkadeSupportedNetworkMode, string> = {
  mainnet: 'https://arkade.computer',
  signet: 'https://mutinynet.arkade.sh',
}

export type ArkadeOperatorViteProxyEntry = {
  localPrefix: string
  targetOrigin: string
  upstreamPathPrefix: string
}

function sameOriginArkOperatorProxyBase(network: ArkadeSupportedNetworkMode): string {
  return `${globalThis.location.origin}${ARKADE_OPERATOR_PROXY_PREFIX}/${network}`
}

export function customArkOperatorMatchesWhitelistedBase(
  customUrl: string,
  networkMode: ArkadeSupportedNetworkMode,
): boolean {
  const normalizedUser = normalizeEsploraBaseUrl(customUrl)
  if (normalizedUser == null) return false
  const base = ARKADE_OPERATOR_UPSTREAM_BASES[networkMode]
  return normalizeEsploraBaseUrl(base) === normalizedUser
}

/**
 * Operator URL passed into arkade.worker / WASM.
 * In the browser, routes through the same-origin proxy to avoid worker fetch issues.
 */
export function getArkOperatorUrl(
  networkMode: ArkadeSupportedNetworkMode,
  envOverride?: string,
): string {
  const upstream =
    envOverride?.trim() ||
    ARKADE_OPERATOR_UPSTREAM_BASES[networkMode]

  if (typeof globalThis.location === 'undefined') {
    return upstream
  }

  if (envOverride && !customArkOperatorMatchesWhitelistedBase(upstream, networkMode)) {
    return upstream
  }

  return sameOriginArkOperatorProxyBase(networkMode)
}

export function arkOperatorViteProxyEntries(): ArkadeOperatorViteProxyEntry[] {
  const entries: ArkadeOperatorViteProxyEntry[] = []
  for (const network of Object.keys(
    ARKADE_OPERATOR_UPSTREAM_BASES,
  ) as ArkadeSupportedNetworkMode[]) {
    const baseUrl = ARKADE_OPERATOR_UPSTREAM_BASES[network]
    const parsedBaseUrl = new URL(baseUrl)
    const upstreamPathPrefix = parsedBaseUrl.pathname.replace(/\/$/, '') || ''
    entries.push({
      localPrefix: `${ARKADE_OPERATOR_PROXY_PREFIX}/${network}`,
      targetOrigin: `${parsedBaseUrl.protocol}//${parsedBaseUrl.host}`,
      upstreamPathPrefix,
    })
  }
  return entries
}

export function getUpstreamArkOperatorBase(
  network: string,
): string | null {
  if (network !== 'mainnet' && network !== 'signet') return null
  return ARKADE_OPERATOR_UPSTREAM_BASES[network]
}
