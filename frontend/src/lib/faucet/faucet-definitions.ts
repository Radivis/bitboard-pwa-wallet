import type { NetworkMode } from '@/stores/walletStore'

/**
 * Supported networks with curated third-party test faucets.
 */
export type FaucetNetwork = 'testnet' | 'signet' | 'mutinynet'

export type FaucetEntry = {
  id: string
  label: string
  url: string
  network: FaucetNetwork
}

export const FAUCETS_BY_NETWORK: Record<FaucetNetwork, FaucetEntry[]> = {
  testnet: [
    {
      id: 'mempool-testnet4',
      label: 'Mempool (testnet4)',
      url: 'https://mempool.space/testnet4/faucet',
      network: 'testnet',
    },
    {
      id: 'testnet4-dev',
      label: 'Testnet4.dev',
      url: 'https://faucet.testnet4.dev/',
      network: 'testnet',
    },
    {
      id: 'coinfaucet-eu',
      label: 'Coinfaucet (EU)',
      url: 'https://coinfaucet.eu/en/btc-testnet4/',
      network: 'testnet',
    },
    {
      id: 'testnet4-info',
      label: 'Testnet4.info',
      url: 'https://testnet4.info/',
      network: 'testnet',
    },
    {
      id: 'eternitybits',
      label: 'Eternity Bits',
      url: 'https://eternitybits.com/faucet/',
      network: 'testnet',
    },
  ],
  signet: [
    {
      id: 'bitcoin-signet-faucet',
      label: 'Bitcoin Signet Faucet',
      url: 'https://bitcoinsignetfaucet.com/',
      network: 'signet',
    },
    {
      id: 'alt-signet-faucet',
      label: 'Alt Signet Faucet',
      url: 'https://alt.signetfaucet.com/',
      network: 'signet',
    },
    {
      id: 'signet-dcorral',
      label: 'Signet (dcorral)',
      url: 'https://signet.dcorral.com/',
      network: 'signet',
    },
    {
      id: 'coinbin-signet',
      label: 'Coinbin',
      url: 'https://faucet.coinbin.org/',
      network: 'signet',
    },
  ],
  mutinynet: [
    {
      id: 'mutinynet',
      label: 'Mutinynet',
      url: 'https://faucet.mutinynet.com/',
      network: 'mutinynet',
    },
  ],
}

export const FAUCET_ENTRIES: FaucetEntry[] = Object.values(FAUCETS_BY_NETWORK).flat()

function isFaucetNetwork(network: NetworkMode): network is FaucetNetwork {
  return network === 'testnet' || network === 'signet' || network === 'mutinynet'
}

/**
 * Returns curated faucets for the given network mode, or an empty array if none.
 */
export function faucetsForNetwork(network: NetworkMode): FaucetEntry[] {
  if (isFaucetNetwork(network)) {
    return FAUCETS_BY_NETWORK[network]
  }
  return []
}

/** Same-origin path prefix for faucet proxy (no trailing slash). */
export const FAUCET_SAME_ORIGIN_PROXY_PREFIX = '/api/faucet'

export type FaucetViteProxyEntry = {
  /** e.g. `/api/faucet/mempool-testnet4` */
  localPrefix: string
  targetOrigin: string
  /** Path prefix on target host (no trailing slash), e.g. `/testnet4/faucet` */
  upstreamPathPrefix: string
}

/**
 * Builds Vite `server.proxy` entries for faucet URLs.
 * Each faucet ID maps to its upstream origin and path.
 */
export function faucetViteProxyEntries(): FaucetViteProxyEntry[] {
  return FAUCET_ENTRIES.map((entry) => {
    const parsed = new URL(entry.url)
    const upstreamPathPrefix = parsed.pathname.replace(/\/$/, '') || '/'
    return {
      localPrefix: `${FAUCET_SAME_ORIGIN_PROXY_PREFIX}/${entry.id}`,
      targetOrigin: `${parsed.protocol}//${parsed.host}`,
      upstreamPathPrefix,
    }
  })
}

/**
 * Returns the same-origin proxy URL for a faucet by ID.
 */
export function getFaucetProxyUrl(faucetId: string): string {
  return `${globalThis.location.origin}${FAUCET_SAME_ORIGIN_PROXY_PREFIX}/${faucetId}`
}

/**
 * Returns the upstream base URL for a faucet ID, or null if unknown.
 */
export function getUpstreamBaseForFaucetProxy(faucetId: string): string | null {
  const entry = FAUCET_ENTRIES.find((faucetEntry) => faucetEntry.id === faucetId)
  return entry?.url ?? null
}

export function isKnownFaucetId(id: string): boolean {
  return FAUCET_ENTRIES.some((faucetEntry) => faucetEntry.id === id)
}
