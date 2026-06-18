import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { IncomingMessage, ServerResponse } from 'node:http'
import {
  E2E_ARKADE_MOCK_COMMITMENT_TXID,
  E2E_ARKADE_MOCK_CONTROL_PATH,
  E2E_ARKADE_MOCK_DEFAULT_BALANCE_SATS,
  E2E_ARKADE_MOCK_INCOMING_TXID,
  E2E_ARKADE_MOCK_PARTITION_HEADER,
  clearE2eArkadeOperatorMockDiscoveryState,
  getE2eArkadeOperatorMockState,
  readE2eArkadeMockPartitionIdFromRequestHeaders,
  resetE2eArkadeOperatorMockState,
  type E2eArkadeMockIncomingPayment,
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
  'X-SDK-Version',
  'X-Digest',
  E2E_ARKADE_MOCK_PARTITION_HEADER,
].join(', ')

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
  res.setHeader('Access-Control-Allow-Headers', CORS_ALLOW_HEADERS)
  res.end(payload)
}

function sendCorsPreflight(res: ServerResponse): void {
  res.statusCode = 204
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', CORS_ALLOW_HEADERS)
  res.end()
}

async function readJsonRequestBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  const rawBody = Buffer.concat(chunks).toString('utf8').trim()
  if (rawBody === '') {
    return null
  }
  return JSON.parse(rawBody) as unknown
}

function isE2eArkadeMockIncomingPayment(value: unknown): value is E2eArkadeMockIncomingPayment {
  if (value == null || typeof value !== 'object') {
    return false
  }
  const payment = value as E2eArkadeMockIncomingPayment
  return (
    typeof payment.txid === 'string' &&
    typeof payment.amountSats === 'number' &&
    Number.isFinite(payment.amountSats) &&
    typeof payment.timestamp === 'number' &&
    Number.isFinite(payment.timestamp)
  )
}

function applyE2eArkadeMockControlAction(
  partitionId: string,
  mockState: E2eArkadeOperatorMockState,
  body: unknown,
): string | null {
  if (body == null || typeof body !== 'object') {
    return 'Invalid JSON body'
  }

  const payload = body as Record<string, unknown>
  switch (payload.action) {
    case 'setFailing': {
      if (typeof payload.value !== 'boolean') {
        return 'setFailing requires boolean value'
      }
      mockState.shouldFail = payload.value
      return null
    }
    case 'setBalanceSats': {
      if (typeof payload.value !== 'number' || !Number.isFinite(payload.value)) {
        return 'setBalanceSats requires finite number'
      }
      mockState.balanceSats = Math.max(0, Math.floor(payload.value))
      return null
    }
    case 'addIncomingPayment': {
      if (!isE2eArkadeMockIncomingPayment(payload.payment)) {
        return 'addIncomingPayment requires payment object'
      }
      // Replaces any previously queued payment; only one pending slot per partition.
      mockState.pendingIncomingPayment = payload.payment
      return null
    }
    case 'reset': {
      resetE2eArkadeOperatorMockState(partitionId)
      return null
    }
    default:
      return `Unknown action: ${String(payload.action)}`
  }
}

export async function handleE2eArkadeOperatorMockControlRequest(
  req: IncomingMessage,
  res: ServerResponse,
  rawUrl: string,
): Promise<boolean> {
  if (!rawUrl.startsWith(E2E_ARKADE_MOCK_CONTROL_PATH)) {
    return false
  }

  if (req.method === 'OPTIONS') {
    sendCorsPreflight(res)
    return true
  }

  if (req.method !== 'POST') {
    sendJson(res, 405, { message: 'Method not allowed' })
    return true
  }

  const partitionId = readE2eArkadeMockPartitionIdFromRequestHeaders(req.headers)
  let body: unknown
  try {
    body = await readJsonRequestBody(req)
  } catch {
    sendJson(res, 400, { message: 'Invalid JSON body' })
    return true
  }

  const mockState = getE2eArkadeOperatorMockState(partitionId)
  const errorMessage = applyE2eArkadeMockControlAction(partitionId, mockState, body)
  if (errorMessage != null) {
    sendJson(res, 400, { message: errorMessage })
    return true
  }

  sendJson(res, 200, { ok: true })
  return true
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
  script: string,
  index: number,
  payment: MockIncomingPayment,
) {
  const createdAtMs = payment.timestamp * 1000
  const expiresAtMs = createdAtMs + 86_400_000 * 365
  return {
    amount: String(payment.amountSats),
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

function createDefaultFixturePayment(): MockIncomingPayment {
  return {
    txid: E2E_ARKADE_MOCK_INCOMING_TXID,
    amountSats: E2E_ARKADE_MOCK_DEFAULT_BALANCE_SATS,
    timestamp: 1_700_000_000,
  }
}

function ensureDefaultFixturePaymentOnFirstScript(
  mockState: E2eArkadeOperatorMockState,
  scripts: string[],
): void {
  if (scripts.length === 0) {
    return
  }
  if (mockState.paymentsByScript.size > 0) {
    return
  }
  if (mockState.pendingIncomingPayment != null) {
    return
  }
  mockState.paymentsByScript.set(scripts[0], createDefaultFixturePayment())
}

function applyPendingIncomingPaymentToFirstUnfundedScript(
  mockState: E2eArkadeOperatorMockState,
  scripts: string[],
): void {
  if (mockState.pendingIncomingPayment == null) {
    return
  }
  for (const script of scripts) {
    if (mockState.paymentsByScript.has(script)) {
      continue
    }
    mockState.paymentsByScript.set(script, mockState.pendingIncomingPayment)
    mockState.pendingIncomingPayment = null
    return
  }
}

export function buildMockVtxosForScripts(
  mockState: E2eArkadeOperatorMockState,
  scripts: string[],
) {
  if (scripts.length === 0) {
    return []
  }

  ensureDefaultFixturePaymentOnFirstScript(mockState, scripts)
  applyPendingIncomingPaymentToFirstUnfundedScript(mockState, scripts)

  const vtxos = []
  for (const script of scripts) {
    const payment = mockState.paymentsByScript.get(script)
    if (payment != null) {
      vtxos.push(buildIndexerVtxo(script, vtxos.length, payment))
    }
  }
  return vtxos
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
    sendCorsPreflight(res)
    return true
  }

  const mockState = getE2eArkadeOperatorMockState(
    readE2eArkadeMockPartitionIdFromRequestHeaders(req.headers),
  )

  if (mockState.shouldFail) {
    sendJson(res, 503, { message: 'E2E Arkade operator mock: simulated outage' })
    return true
  }

  const upstreamPath = rawUrl.replace(/^\/api\/arkade\/operator\/signet/, '') || '/'

  if (upstreamPath.startsWith('/v1/info')) {
    // Each WASM session open starts with /v1/info; reset discovery within this partition.
    clearE2eArkadeOperatorMockDiscoveryState(mockState)
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
