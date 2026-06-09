import { format, formatDistanceToNow } from 'date-fns'
import type { ArkadeVtxoExpiryStatus } from '@/workers/arkade-api'

export function formatArkadeVtxoExpiryIndicator(
  status: ArkadeVtxoExpiryStatus,
): { primary: string; renewalSoonSuffix: string | null } | null {
  if (status.earliestExpiresAt == null || status.earliestExpiresAt <= 0) {
    return null
  }

  const expiryDate = new Date(status.earliestExpiresAt * 1000)
  const relativeExpiry = formatDistanceToNow(expiryDate, { addSuffix: true })
  const primary = `Earliest VTXO expiry ${relativeExpiry} (${format(expiryDate, 'yyyy-MM-dd HH:mm')})`

  const renewalSoonSuffix =
    status.expiringSoonCount > 0
      ? `${status.expiringSoonCount} need renewal soon`
      : null

  return { primary, renewalSoonSuffix }
}
