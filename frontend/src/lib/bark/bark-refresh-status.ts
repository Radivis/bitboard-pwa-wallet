export const BARK_REFRESH_STATUSES = ['idle', 'scheduled', 'pending', 'warning'] as const

export type BarkRefreshStatus = (typeof BARK_REFRESH_STATUSES)[number]

export function readBarkRefreshStatus(value: unknown): BarkRefreshStatus {
  if (typeof value === 'string' && isBarkRefreshStatus(value)) {
    return value
  }
  throw new Error('Bark refresh status is invalid')
}

function isBarkRefreshStatus(value: string): value is BarkRefreshStatus {
  return BARK_REFRESH_STATUSES.some((status) => status === value)
}

export type BarkNextRefreshSchedule = {
  tipHeight: number
  nextRefreshHeight: number
}

const INVALID_NEXT_REFRESH_SCHEDULE = 'Bark next refresh schedule is invalid'

/** Reads the JSON from `bark_next_refresh_schedule`. `null` means Bark has no next refresh height. */
export function readBarkNextRefreshSchedule(value: unknown): BarkNextRefreshSchedule | null {
  if (typeof value !== 'string') {
    throw new Error(INVALID_NEXT_REFRESH_SCHEDULE)
  }
  const parsed: unknown = JSON.parse(value)
  if (parsed === null) return null
  if (!isBarkNextRefreshSchedule(parsed)) {
    throw new Error(INVALID_NEXT_REFRESH_SCHEDULE)
  }
  return { tipHeight: parsed.tipHeight, nextRefreshHeight: parsed.nextRefreshHeight }
}

function isBarkNextRefreshSchedule(value: unknown): value is BarkNextRefreshSchedule {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Record<string, unknown>
  return isBlockHeight(candidate.tipHeight) && isBlockHeight(candidate.nextRefreshHeight)
}

function isBlockHeight(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

export function barkRefreshNoticeText(status: BarkRefreshStatus): string | null {
  if (status === 'scheduled') {
    return 'Bark refresh scheduled. It finishes on a later sync.'
  }
  if (status === 'pending') {
    return 'Bark refresh is still in progress.'
  }
  return null
}

export function barkRefreshWarningText(status: BarkRefreshStatus): string | null {
  if (status === 'warning') {
    return 'Bark could not schedule a refresh.'
  }
  return null
}
