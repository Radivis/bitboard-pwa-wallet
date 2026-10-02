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
