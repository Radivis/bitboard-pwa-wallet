import type { BitboardBarkWasm } from '@/lib/bark/load-bitboard-bark-wasm'
import type { BarkPendingAction, BarkPendingActionKind } from '@/workers/bark-api'
import { BARK_PENDING_ACTION_KINDS } from '@/workers/bark-api'

export async function pendingActionsFromWasm(
  wasm: Pick<BitboardBarkWasm, 'bark_pending_actions'>,
): Promise<BarkPendingAction[]> {
  return readBarkPendingActionsJson(await wasm.bark_pending_actions())
}

export function readBarkPendingActionsJson(value: unknown): BarkPendingAction[] {
  let parsed: unknown = value
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value) as unknown
    } catch {
      throw new Error('Bark pending actions were not JSON')
    }
  }
  if (!Array.isArray(parsed)) {
    throw new Error('Bark pending actions were not a list')
  }
  return parsed.map(readBarkPendingAction)
}

function readBarkPendingAction(value: unknown): BarkPendingAction {
  if (value == null || typeof value !== 'object') {
    throw new Error('Bark pending action was not an object')
  }
  const row = value as Record<string, unknown>
  const kind = row.kind
  if (!isBarkPendingActionKind(kind)) {
    throw new Error('Bark pending action has an unknown kind')
  }
  return {
    id: readNonEmptyString(row.id, 'Bark pending action id'),
    kind,
    title: readNonEmptyString(row.title, 'Bark pending action title'),
    status: readNonEmptyString(row.status, 'Bark pending action status'),
    amountSats: readSafeInteger(row.amountSats, 'Bark pending action amount'),
    feeSats: readOptionalSats(row.feeSats, 'Bark pending action fee'),
    destination: readOptionalString(row.destination),
    txid: readOptionalString(row.txid),
    error: readOptionalString(row.error),
  }
}

function isBarkPendingActionKind(value: unknown): value is BarkPendingActionKind {
  return (
    typeof value === 'string' &&
    BARK_PENDING_ACTION_KINDS.some((kind) => kind === value)
  )
}

function readOptionalString(value: unknown): string | null {
  if (value == null) return null
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error('Bark pending action text was empty')
  }
  return value
}

function readOptionalSats(value: unknown, label: string): number | null {
  if (value == null) return null
  return readSafeInteger(value, label)
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
