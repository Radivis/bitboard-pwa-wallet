/* eslint-disable @typescript-eslint/naming-convention -- Esplora REST JSON field names */
import type { IncomingMessage, ServerResponse } from 'node:http'

/**
 * Same-origin Esplora prefix used by WASM (`/api/esplora/{provider}/{network}/…`).
 * Mock ASP E2E must not proxy these to live Mutinynet/testnet4: parallel full scans
 * starve the Vite proxy and leave Settings network buttons disabled.
 */
export const E2E_ARKADE_MOCK_ESPLORA_PREFIX = '/api/esplora/'

const E2E_ARKADE_MOCK_ESPLORA_TIP_HEIGHT = '0'

/**
 * Display-hex genesis hashes from `bitcoin` 0.32 `ChainHash` (same as BDK local chain).
 * Tip must match genesis so full scan does not look up a fake header (`HeaderHashNotFound`).
 */
const E2E_ARKADE_MOCK_ESPLORA_GENESIS_BY_NETWORK: Record<string, string> = {
  bitcoin: '000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f',
  testnet: '00000000da84f2bafbbc53dee25a72ae507ff4914b867c565be350b0da8bf043',
  signet: '00000008819873e925422c1ff0f99f7cc9bbb232af63a077a480a3633bee1ef6',
  regtest: '0f9188f13cb7b2c71f2a335e3a4fc328bf5beb436012afca590b1a11466e2206',
}

const E2E_ARKADE_MOCK_ESPLORA_FEE_ESTIMATES = {
  '1': 1,
  '2': 1,
  '3': 1,
  '6': 1,
  '144': 1,
} as const

function genesisHashForNetwork(network: string): string {
  return (
    E2E_ARKADE_MOCK_ESPLORA_GENESIS_BY_NETWORK[network] ??
    E2E_ARKADE_MOCK_ESPLORA_GENESIS_BY_NETWORK.testnet
  )
}

function genesisBlockSummary(network: string) {
  const genesisHash = genesisHashForNetwork(network)
  return {
    id: genesisHash,
    height: 0,
    version: 1,
    timestamp: 1_296_688_608,
    tx_count: 1,
    size: 80,
    weight: 320,
    merkle_root: genesisHash,
    previousblockhash: null,
    mediantime: 1_296_688_608,
    nonce: 0,
    bits: 486604799,
    difficulty: 1,
  }
}

function sendCorsPreflight(res: ServerResponse): void {
  res.statusCode = 204
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, Cache-Control, Pragma')
  res.end()
}

function sendText(res: ServerResponse, statusCode: number, body: string): void {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'text/plain; charset=utf-8')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.end(body)
}

function sendJson(res: ServerResponse, statusCode: number, body: unknown): void {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.end(JSON.stringify(body))
}

export function parseE2eArkadeEsploraProxyUrl(urlPath: string): {
  network: string
  esploraPath: string
} | null {
  if (!urlPath.startsWith(E2E_ARKADE_MOCK_ESPLORA_PREFIX)) {
    return null
  }
  const rest = urlPath.slice(E2E_ARKADE_MOCK_ESPLORA_PREFIX.length)
  const slashAfterProvider = rest.indexOf('/')
  if (slashAfterProvider < 0) {
    return null
  }
  const afterProvider = rest.slice(slashAfterProvider + 1)
  const slashAfterNetwork = afterProvider.indexOf('/')
  if (slashAfterNetwork < 0) {
    return { network: afterProvider, esploraPath: '/' }
  }
  return {
    network: afterProvider.slice(0, slashAfterNetwork),
    esploraPath: afterProvider.slice(slashAfterNetwork),
  }
}

/** `/api/esplora/{provider}/{network}/blocks/tip/hash` → `/blocks/tip/hash`. */
export function esploraPathAfterProxyPrefix(urlPath: string): string | null {
  return parseE2eArkadeEsploraProxyUrl(urlPath)?.esploraPath ?? null
}

function respondToEsploraPath(
  res: ServerResponse,
  method: string,
  network: string,
  esploraPath: string,
): void {
  const genesisHash = genesisHashForNetwork(network)
  if (esploraPath === '/blocks/tip/height' || esploraPath.startsWith('/blocks/tip/height')) {
    sendText(res, 200, E2E_ARKADE_MOCK_ESPLORA_TIP_HEIGHT)
    return
  }
  if (esploraPath === '/blocks/tip/hash' || esploraPath.startsWith('/block-height/')) {
    sendText(res, 200, genesisHash)
    return
  }
  if (esploraPath === '/blocks' || /^\/blocks\/\d+$/.test(esploraPath)) {
    sendJson(res, 200, [genesisBlockSummary(network)])
    return
  }
  if (esploraPath === '/fee-estimates') {
    sendJson(res, 200, E2E_ARKADE_MOCK_ESPLORA_FEE_ESTIMATES)
    return
  }
  if (esploraPath === '/tx' && method === 'POST') {
    sendText(res, 200, genesisHash)
    return
  }
  if (
    esploraPath.includes('/txs') ||
    esploraPath.endsWith('/utxo') ||
    esploraPath.includes('/utxo')
  ) {
    sendJson(res, 200, [])
    return
  }
  if (esploraPath.startsWith('/tx/')) {
    sendText(res, 404, 'Transaction not found')
    return
  }
  sendJson(res, 200, [])
}

export function handleE2eArkadeEsploraMockRequest(
  req: IncomingMessage,
  res: ServerResponse,
  rawUrl: string,
): boolean {
  const urlPath = rawUrl.split('?')[0] ?? ''
  const parsed = parseE2eArkadeEsploraProxyUrl(urlPath)
  if (parsed == null) {
    return false
  }

  if (req.method === 'OPTIONS') {
    sendCorsPreflight(res)
    return true
  }

  respondToEsploraPath(res, req.method ?? 'GET', parsed.network, parsed.esploraPath)
  return true
}
