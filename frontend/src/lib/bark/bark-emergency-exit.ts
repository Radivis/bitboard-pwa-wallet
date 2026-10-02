import {
  BARK_EMERGENCY_EXIT_STATES,
  BARK_EXIT_GRAPH_NODE_STATUSES,
  type BarkExitGraph,
  type BarkExitGraphNode,
  type BarkExitGraphNodeStatus,
  type BarkEmergencyCpfpRequest,
  type BarkEmergencyExitDrain,
  type BarkEmergencyExitEstimate,
  type BarkEmergencyExitProgress,
  type BarkEmergencyExitRow,
  type BarkEmergencyExitState,
} from '@/workers/bark-api'

export function barkEmergencyExitStateLabel(state: BarkEmergencyExitState): string {
  switch (state) {
    case 'start':
      return 'Started'
    case 'processing':
      return 'Processing'
    case 'awaitingDelta':
      return 'Waiting for timelock'
    case 'claimable':
      return 'Claimable'
    case 'claimInProgress':
      return 'Claim in progress'
    case 'claimed':
      return 'Claimed'
    case 'vtxoAlreadySpent':
      return 'Already spent'
    case 'canceled':
      return 'Canceled'
  }
}

export function emergencyExitStartBlocked(
  confirmedSats: number,
  exitBroadcastFeeSats: number,
): boolean {
  return confirmedSats < exitBroadcastFeeSats
}

export function readBarkEmergencyExitEstimate(value: unknown): BarkEmergencyExitEstimate {
  const row = readObject(value, 'Bark emergency exit estimate')
  return {
    exitBroadcastFeeSats: readSats(row.exitBroadcastFeeSats, 'broadcast fee'),
    claimFeeSats: readSats(row.claimFeeSats, 'claim fee'),
    feeRateSatPerVb: readFeeRate(row.feeRateSatPerVb),
    txsToBroadcast: readCount(row.txsToBroadcast),
  }
}

export function readBarkEmergencyExitRows(value: unknown): BarkEmergencyExitRow[] {
  const parsed = parseJson(value, 'Bark emergency exit list')
  if (!Array.isArray(parsed)) {
    throw new Error('Bark emergency exit list was not a list')
  }
  return parsed.map(readEmergencyExitRow)
}

export function readBarkEmergencyExitProgress(value: unknown): BarkEmergencyExitProgress {
  const row = readObject(parseJson(value, 'Bark emergency exit progress'), 'Bark emergency exit progress')
  if (!Array.isArray(row.requests)) {
    throw new Error('Bark emergency exit progress requests were not a list')
  }
  return {
    requests: row.requests.map(readCpfpRequest),
  }
}

export function readBarkEmergencyExitDrain(value: unknown): BarkEmergencyExitDrain {
  const row = readObject(parseJson(value, 'Bark emergency exit claim'), 'Bark emergency exit claim')
  return {
    psbtHex: readHex(row.psbtHex, 'claim PSBT'),
    rawTxHex: readHex(row.rawTxHex, 'claim transaction'),
  }
}

function readEmergencyExitRow(value: unknown): BarkEmergencyExitRow {
  const row = readObject(value, 'Bark emergency exit row')
  if (typeof row.vtxoId !== 'string' || row.vtxoId.length === 0) {
    throw new Error('Bark emergency exit row has no VTXO id')
  }
  if (!isEmergencyExitState(row.state)) {
    throw new Error('Bark emergency exit row has an unknown state')
  }
  if (typeof row.cancelable !== 'boolean') {
    throw new Error('Bark emergency exit row has no cancelable flag')
  }
  return { vtxoId: row.vtxoId, state: row.state, cancelable: row.cancelable }
}

function readCpfpRequest(value: unknown): BarkEmergencyCpfpRequest {
  const row = readObject(value, 'Bark emergency exit CPFP request')
  return {
    vtxoId: readText(row.vtxoId, 'CPFP VTXO id'),
    parentTxid: readText(row.parentTxid, 'CPFP parent transaction id'),
    parentTxHex: readHex(row.parentTxHex, 'CPFP parent transaction'),
    rbfMinFeeRateSatPerKwu: readOptionalCount(row.rbfMinFeeRateSatPerKwu, 'RBF fee rate'),
    currentPackageFeeSats: readOptionalCount(row.currentPackageFeeSats, 'package fee'),
  }
}

function isEmergencyExitState(value: unknown): value is BarkEmergencyExitState {
  return (
    typeof value === 'string' &&
    (BARK_EMERGENCY_EXIT_STATES as readonly string[]).includes(value)
  )
}

function parseJson(value: unknown, label: string): unknown {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value) as unknown
  } catch {
    throw new Error(`${label} was not JSON`)
  }
}

function readObject(value: unknown, label: string): Record<string, unknown> {
  const parsed = parseJson(value, label)
  if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${label} was not an object`)
  }
  return parsed as Record<string, unknown>
}

function readSats(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Bark emergency exit ${label} is invalid`)
  }
  return value
}

function readCount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error('Bark emergency exit transaction count is invalid')
  }
  return value
}

function readOptionalCount(value: unknown, label: string): number | null {
  if (value == null) return null
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Bark emergency exit ${label} is invalid`)
  }
  return value
}

export function barkExitTopologyVtxoIds(params: {
  wholeWallet: boolean
  selectedIds: string[]
  spendableIds: string[]
  liveExitIds: string[]
}): string[] {
  const selectedIds = params.wholeWallet ? params.spendableIds : params.selectedIds
  return [...new Set([...selectedIds, ...params.liveExitIds])].sort()
}

export function readBarkExitGraph(value: unknown): BarkExitGraph {
  const row = readObject(parseJson(value, 'Bark exit tree'), 'Bark exit tree')
  if (!Array.isArray(row.nodes)) {
    throw new Error('Bark exit tree nodes were not a list')
  }
  return { nodes: row.nodes.map(readExitGraphNode) }
}

function readExitGraphNode(value: unknown): BarkExitGraphNode {
  const row = readObject(value, 'Bark exit tree node')
  if (!isExitGraphNodeStatus(row.status)) {
    throw new Error('Bark exit tree node has an unknown status')
  }
  if (typeof row.needsChild !== 'boolean') {
    throw new Error('Bark exit tree node has no needs-child flag')
  }
  return {
    txid: readText(row.txid, 'exit tree transaction id'),
    spends: readTextList(row.spends, 'exit tree spends'),
    leafVtxoIds: readTextList(row.leafVtxoIds, 'exit tree leaf VTXO ids'),
    status: row.status,
    needsChild: row.needsChild,
    waitingOnTxids: readTextList(row.waitingOnTxids, 'exit tree waiting transactions'),
  }
}

function isExitGraphNodeStatus(value: unknown): value is BarkExitGraphNodeStatus {
  return (
    typeof value === 'string' &&
    (BARK_EXIT_GRAPH_NODE_STATUSES as readonly string[]).includes(value)
  )
}

function readTextList(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string' || entry.length === 0)) {
    throw new Error(`Bark emergency exit ${label} is invalid`)
  }
  return value
}

function readFeeRate(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error('Bark emergency exit fee rate is invalid')
  }
  return value
}

function readText(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Bark emergency exit ${label} is missing`)
  }
  return value
}

function readHex(value: unknown, label: string): string {
  return readText(value, label)
}
