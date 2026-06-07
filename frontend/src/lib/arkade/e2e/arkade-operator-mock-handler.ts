import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { IncomingMessage, ServerResponse } from 'node:http'
import {
  E2E_ARKADE_MOCK_DEFAULT_BALANCE_SATS,
  E2E_ARKADE_MOCK_INCOMING_TXID,
  e2eArkadeOperatorMockState,
} from './arkade-operator-mock-state'

const mockHandlerDir = path.dirname(fileURLToPath(import.meta.url))
const serverInfoFixturePath = path.resolve(
  mockHandlerDir,
  '../../../../tests/e2e/fixtures/arkade-operator/server-info.json',
)

let cachedServerInfoJson: string | null = null

function loadServerInfoJson(): string {
  if (cachedServerInfoJson == null) {
    cachedServerInfoJson = readFileSync(serverInfoFixturePath, 'utf8')
  }
  return cachedServerInfoJson
}

function sendJson(res: ServerResponse, statusCode: number, body: unknown): void {
  const payload = JSON.stringify(body)
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, X-Build-Version')
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

function buildIndexerVtxo(script: string, index: number, payment: MockIncomingPayment) {
  const createdAtMs = payment.timestamp * 1000
  const expiresAtMs = createdAtMs + 86_400_000 * 365
  return {
    amount: String(
      Math.max(e2eArkadeOperatorMockState.balanceSats, payment.amountSats),
    ),
    arkTxid: payment.txid,
    assets: [],
    commitmentTxids: [],
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

function buildMockVtxosForScripts(scripts: string[]) {
  const defaultPayment: MockIncomingPayment = {
    txid: E2E_ARKADE_MOCK_INCOMING_TXID,
    amountSats: E2E_ARKADE_MOCK_DEFAULT_BALANCE_SATS,
    timestamp: 1_700_000_000,
  }

  if (scripts.length === 0) {
    return []
  }

  const fundedScript = e2eArkadeOperatorMockState.fundedScript
  if (fundedScript != null) {
    if (!scripts.includes(fundedScript)) {
      return []
    }
    return [buildIndexerVtxo(fundedScript, 0, defaultPayment)]
  }

  const firstScript = scripts[0]
  e2eArkadeOperatorMockState.fundedScript = firstScript
  return [buildIndexerVtxo(firstScript, 0, defaultPayment)]
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

function buildListVtxosResponse(requestUrl: string) {
  if (isPendingOnlyVtxosRequest(requestUrl)) {
    return emptyListVtxosResponse()
  }

  const scripts = parseScriptsFromRequestUrl(requestUrl)
  const vtxos = buildMockVtxosForScripts(scripts)
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
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, X-Build-Version')
    res.end()
    return true
  }

  if (e2eArkadeOperatorMockState.shouldFail) {
    sendJson(res, 503, { message: 'E2E Arkade operator mock: simulated outage' })
    return true
  }

  const upstreamPath = rawUrl.replace(/^\/api\/arkade\/operator\/signet/, '') || '/'

  if (upstreamPath.startsWith('/v1/info')) {
    res.statusCode = 200
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.end(loadServerInfoJson())
    return true
  }

  if (upstreamPath.startsWith('/v1/indexer/vtxos')) {
    sendJson(res, 200, buildListVtxosResponse(rawUrl))
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
