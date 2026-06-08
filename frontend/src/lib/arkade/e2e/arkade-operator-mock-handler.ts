import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { IncomingMessage, ServerResponse } from 'node:http'
import {
  E2E_ARKADE_MOCK_COMMITMENT_TXID,
  E2E_ARKADE_MOCK_DEFAULT_BALANCE_SATS,
  E2E_ARKADE_MOCK_INCOMING_TXID,
  E2E_ARKADE_MOCK_PARTITION_COOKIE,
  E2E_ARKADE_MOCK_PARTITION_HEADER,
  getE2eArkadeOperatorMockState,
  type E2eArkadeOperatorMockState,
} from './arkade-operator-mock-state'

const mockHandlerDir = path.dirname(fileURLToPath(import.meta.url))
const serverInfoFixturePath = path.resolve(
  mockHandlerDir,
  '../../../../tests/e2e/fixtures/arkade-operator/server-info.json',
)

const CORS_ALLOW_HEADERS = [
  'Content-Type',
  'Accept',
  'X-Build-Version',
  E2E_ARKADE_MOCK_PARTITION_HEADER,
].join(', ')

let cachedServerInfoJson: string | null = null

function loadServerInfoJson(): string {
  if (cachedServerInfoJson == null) {
    cachedServerInfoJson = readFileSync(serverInfoFixturePath, 'utf8')
  }
  return cachedServerInfoJson
}

function readPartitionFromCookieHeader(cookieHeader: string): string | null {
  const prefix = `${E2E_ARKADE_MOCK_PARTITION_COOKIE}=`
  for (const part of cookieHeader.split(';')) {
    const trimmed = part.trim()
    if (trimmed.startsWith(prefix)) {
      const value = decodeURIComponent(trimmed.slice(prefix.length)).trim()
      if (value !== '') {
        return value
      }
    }
  }
  return null
}

function readMockPartitionId(req: IncomingMessage): string {
  const rawHeader = req.headers[E2E_ARKADE_MOCK_PARTITION_HEADER]
  if (typeof rawHeader === 'string' && rawHeader.trim() !== '') {
    return rawHeader.trim()
  }

  const cookieHeader = req.headers.cookie
  if (typeof cookieHeader === 'string') {
    const fromCookie = readPartitionFromCookieHeader(cookieHeader)
    if (fromCookie != null) {
      return fromCookie
    }
  }

  return 'default'
}

function sendJson(res: ServerResponse, statusCode: number, body: unknown): void {
  const payload = JSON.stringify(body)
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', CORS_ALLOW_HEADERS)
  res.end(payload)
}

/** Operator sends `scripts` as a comma-separated query value (see ark-rest client). */
function parseScriptsFromRequestUrl(requestUrl: string): string[] {
  const url = new URL(requestUrl, 'http://localhost')
  const scripts: string[] = []
  for (const value of url.searchParams.getAll('scripts')) {
    for (const part of value.split(',')) {
      const trimmed = part.trim()
      if (trimmed !== '') {
        scripts.push(trimmed)
      }
    }
  }
  return scripts
}

type MockIncomingPayment = {
  txid: string
  amountSats: number
  timestamp: number
}

function buildIndexerVtxo(
  mockState: E2eArkadeOperatorMockState,
  script: string,
  index: number,
  payment: MockIncomingPayment,
) {
  const createdAtMs = payment.timestamp * 1000
  const expiresAtMs = createdAtMs + 86_400_000 * 365
  return {
    amount: String(Math.max(mockState.balanceSats, payment.amountSats)),
    arkTxid: payment.txid,
    assets: [],
    commitmentTxids: [E2E_ARKADE_MOCK_COMMITMENT_TXID],
    createdAt: String(createdAtMs),
    expiresAt: String(expiresAtMs),
    isPreconfirmed: false,
    isSpent: false,
    isSwept: false,
    isUnrolled: false,
    outpoint: {
      txid: payment.txid,
      vout: index,
    },
    script,
    settledBy: '',
    spentBy: '',
  }
}

function buildMockVtxosForScripts(
  mockState: E2eArkadeOperatorMockState,
  scripts: string[],
) {
  const defaultPayment: MockIncomingPayment = {
    txid: E2E_ARKADE_MOCK_INCOMING_TXID,
    amountSats: E2E_ARKADE_MOCK_DEFAULT_BALANCE_SATS,
    timestamp: 1_700_000_000,
  }

  if (scripts.length === 0) {
    return []
  }

  const fundedScript = mockState.fundedScript
  if (fundedScript != null) {
    if (!scripts.includes(fundedScript)) {
      return []
    }
    return [buildIndexerVtxo(mockState, fundedScript, 0, defaultPayment)]
  }

  const firstScript = scripts[0]
  mockState.fundedScript = firstScript
  return [buildIndexerVtxo(mockState, firstScript, 0, defaultPayment)]
}

function emptyListVtxosResponse() {
  return {
    vtxos: [],
    page: {
      current: 0,
      next: 0,
      total: 0,
    },
  }
}

function isPendingOnlyVtxosRequest(requestUrl: string): boolean {
  const url = new URL(requestUrl, 'http://localhost')
  return url.searchParams.get('pendingOnly') === 'true'
}

function buildListVtxosResponse(
  mockState: E2eArkadeOperatorMockState,
  requestUrl: string,
) {
  if (isPendingOnlyVtxosRequest(requestUrl)) {
    return emptyListVtxosResponse()
  }

  const scripts = parseScriptsFromRequestUrl(requestUrl)
  const vtxos = buildMockVtxosForScripts(mockState, scripts)
  const total = vtxos.length
  return {
    vtxos,
    page: {
      current: 0,
      next: total,
      total,
    },
  }
}

export function handleE2eArkadeOperatorMockRequest(
  req: IncomingMessage,
  res: ServerResponse,
  rawUrl: string,
): boolean {
  if (!rawUrl.startsWith('/api/arkade/operator/signet')) {
    return false
  }

  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', CORS_ALLOW_HEADERS)
    res.end()
    return true
  }

  const mockState = getE2eArkadeOperatorMockState(readMockPartitionId(req))

  if (mockState.shouldFail) {
    sendJson(res, 503, { message: 'E2E Arkade operator mock: simulated outage' })
    return true
  }

  const upstreamPath = rawUrl.replace(/^\/api\/arkade\/operator\/signet/, '') || '/'

  if (upstreamPath.startsWith('/v1/info')) {
    // Each WASM session open starts with /v1/info; reset discovery within this partition.
    mockState.fundedScript = null
    res.statusCode = 200
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.end(loadServerInfoJson())
    return true
  }

  if (upstreamPath.startsWith('/v1/indexer/vtxos')) {
    sendJson(res, 200, buildListVtxosResponse(mockState, rawUrl))
    return true
  }

  if (upstreamPath.startsWith('/v1/indexer/script/subscribe')) {
    sendJson(res, 200, { subscriptionId: 'e2e-arkade-mock-subscription' })
    return true
  }

  if (upstreamPath.startsWith('/v1/indexer/script/unsubscribe')) {
    sendJson(res, 200, {})
    return true
  }

  if (upstreamPath.startsWith('/v1/tx/pending')) {
    sendJson(res, 200, { pendingTxs: [] })
    return true
  }

  if (upstreamPath.startsWith('/v1/txs')) {
    sendJson(res, 200, { txs: [] })
    return true
  }

  if (upstreamPath.startsWith('/v1/batch/events')) {
    res.statusCode = 200
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.end('')
    return true
  }

  sendJson(res, 200, {})
  return true
}

export { E2E_ARKADE_MOCK_INCOMING_TXID }
