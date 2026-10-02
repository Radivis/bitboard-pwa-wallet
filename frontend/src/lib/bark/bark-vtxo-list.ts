import type { BitboardBarkWasm } from '@/lib/bark/load-bitboard-bark-wasm'
import type { BarkVtxoLockHolder, BarkVtxoRow, BarkVtxoState } from '@/workers/bark-api'
import { BARK_VTXO_STATES } from '@/workers/bark-api'

const BARK_VTXO_LOCK_HOLDER_KINDS = ['action', 'movement'] as const

export function readBarkVtxoListJson(value: unknown): BarkVtxoRow[] {
  let parsed: unknown = value
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value) as unknown
    } catch {
      throw new Error('Bark VTXO list was not JSON')
    }
  }
  if (!Array.isArray(parsed)) {
    throw new Error('Bark VTXO list was not a list')
  }
  return parsed.map(readBarkVtxoRow)
}

export async function listVtxosFromWasm(
  wasm: Pick<BitboardBarkWasm, 'bark_list_vtxos'>,
): Promise<BarkVtxoRow[]> {
  return readBarkVtxoListJson(await wasm.bark_list_vtxos())
}

function readBarkVtxoRow(value: unknown): BarkVtxoRow {
  if (value == null || typeof value !== 'object') {
    throw new Error('Bark VTXO row was not an object')
  }
  const row = value as Record<string, unknown>
  const state = row.state
  if (!isBarkVtxoState(state)) {
    throw new Error('Bark VTXO row has an unknown state')
  }
  return {
    id: readNonEmptyString(row.id, 'Bark VTXO id'),
    amountSats: readSafeInteger(row.amountSats, 'Bark VTXO amount'),
    expiryHeight: readSafeInteger(row.expiryHeight, 'Bark VTXO expiry height'),
    state,
    lockHolder: state === 'locked' ? readLockHolder(row.lockHolder) : null,
    registered: readBoolean(row.registered, 'Bark VTXO registered'),
  }
}

function readLockHolder(value: unknown): BarkVtxoLockHolder | null {
  if (value == null) return null
  if (typeof value !== 'object') {
    throw new Error('Bark VTXO lock holder was not an object')
  }
  const holder = value as Record<string, unknown>
  const kind = holder.kind
  if (!isLockHolderKind(kind)) {
    throw new Error('Bark VTXO lock holder has an unknown kind')
  }
  return {
    kind,
    id: readNonEmptyString(holder.id, 'Bark VTXO lock holder id'),
  }
}

function isBarkVtxoState(value: unknown): value is BarkVtxoState {
  return typeof value === 'string' && BARK_VTXO_STATES.some((state) => state === value)
}

function isLockHolderKind(value: unknown): value is BarkVtxoLockHolder['kind'] {
  return (
    typeof value === 'string' &&
    BARK_VTXO_LOCK_HOLDER_KINDS.some((kind) => kind === value)
  )
}

function readNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${label} was missing`)
  }
  return value
}

function readSafeInteger(value: unknown, label: string): number {
  const parsed = typeof value === 'bigint' || typeof value === 'number' ? Number(value) : Number.NaN
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`${label} was not a safe integer`)
  }
  return parsed
}

function readBoolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`${label} was not a boolean`)
  }
  return value
}
