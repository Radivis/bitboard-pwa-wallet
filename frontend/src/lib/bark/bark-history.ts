import type { BarkMovementRow, BarkMovementStatus } from '@/workers/bark-api'

const BARK_MOVEMENT_STATUSES: readonly BarkMovementStatus[] = [
  'pending',
  'successful',
  'failed',
  'canceled',
]

export function barkMovementActivityLabel(subsystemName: string): string {
  if (subsystemName === 'bark.board') return 'Bark boarding'
  if (subsystemName === 'bark.offboard') return 'Bark exit'
  return 'Bark'
}

export function readBarkHistoryJson(value: unknown): BarkMovementRow[] {
  let parsed: unknown = value
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value) as unknown
    } catch {
      throw new Error('Bark history was not JSON')
    }
  }
  if (!Array.isArray(parsed)) {
    throw new Error('Bark history was not a list')
  }
  return parsed.map(readBarkMovementRow)
}

function readBarkMovementRow(value: unknown): BarkMovementRow {
  if (value == null || typeof value !== 'object') {
    throw new Error('Bark history row was not an object')
  }
  const row = value as Record<string, unknown>
  const status = row.status
  if (!isBarkMovementStatus(status)) {
    throw new Error('Bark history row has an unknown status')
  }
  return {
    id: readSafeInteger(row.id, 'Bark history id'),
    status,
    subsystemName: readNonEmptyString(row.subsystemName, 'Bark history subsystem'),
    subsystemKind: readNonEmptyString(row.subsystemKind, 'Bark history kind'),
    effectiveBalanceSats: readSignedInteger(row.effectiveBalanceSats, 'Bark history amount'),
    offchainFeeSats: readSafeInteger(row.offchainFeeSats, 'Bark history fee'),
    createdAtUnixSeconds: readSignedInteger(row.createdAtUnixSeconds, 'Bark history time'),
  }
}

function isBarkMovementStatus(value: unknown): value is BarkMovementStatus {
  return (
    typeof value === 'string' &&
    BARK_MOVEMENT_STATUSES.some((status) => status === value)
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

function readSignedInteger(value: unknown, label: string): number {
  const parsed = typeof value === 'bigint' || typeof value === 'number' ? Number(value) : Number.NaN
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`${label} was not a safe integer`)
  }
  return parsed
}
