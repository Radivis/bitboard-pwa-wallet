/**
 * Curated third-party faucets aligned with default Esplora stacks
 * (Testnet4 / public Signet / Mutinynet).
 */
export type FaucetStackId = 'mempool_testnet4' | 'public_signet' | 'mutinynet_signet'

export type FaucetEntry = {
  id: string
  label: string
  url: string
  stackId: FaucetStackId
}

export const FAUCET_ENTRIES: FaucetEntry[] = [
  {
    id: 'mempool-testnet4',
    label: 'Mempool (testnet4)',
    url: 'https://mempool.space/testnet4/faucet',
    stackId: 'mempool_testnet4',
  },
  {
    id: 'testnet4-dev',
    label: 'Testnet4.dev',
    url: 'https://faucet.testnet4.dev/',
    stackId: 'mempool_testnet4',
  },
  {
    id: 'coinfaucet-eu',
    label: 'Coinfaucet (EU)',
    url: 'https://coinfaucet.eu/en/btc-testnet4/',
    stackId: 'mempool_testnet4',
  },
  {
    id: 'testnet4-info',
    label: 'Testnet4.info',
    url: 'https://testnet4.info/',
    stackId: 'mempool_testnet4',
  },
  {
    id: 'eternitybits',
    label: 'Eternity Bits',
    url: 'https://eternitybits.com/faucet/',
    stackId: 'mempool_testnet4',
  },
  {
    id: 'bitcoin-signet-faucet',
    label: 'Bitcoin Signet Faucet',
    url: 'https://bitcoinsignetfaucet.com/',
    stackId: 'public_signet',
  },
  {
    id: 'alt-signet-faucet',
    label: 'Alt Signet Faucet',
    url: 'https://alt.signetfaucet.com/',
    stackId: 'public_signet',
  },
  {
    id: 'signet-dcorral',
    label: 'Signet (dcorral)',
    url: 'https://signet.dcorral.com/',
    stackId: 'public_signet',
  },
  {
    id: 'coinbin-signet',
    label: 'Coinbin',
    url: 'https://faucet.coinbin.org/',
    stackId: 'public_signet',
  },
  {
    id: 'mutinynet',
    label: 'Mutinynet',
    url: 'https://faucet.mutinynet.com/',
    stackId: 'mutinynet_signet',
  },
]

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
