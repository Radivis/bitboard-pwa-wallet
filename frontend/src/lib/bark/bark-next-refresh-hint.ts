import { format } from 'date-fns'
import type { BarkNextRefreshSchedule } from '@/lib/bark/bark-refresh-status'
import {
  averageBitcoinBlockSeconds,
  type BarkBitcoinNetwork,
} from '@/lib/bark/bark-vtxo-expiry'

export type BarkNextRefreshObservation = BarkNextRefreshSchedule & {
  /** Sync time at which `tipHeight` was read. The estimate counts blocks from here. */
  observedAt: string
}

export type BarkNextRefreshHint = {
  periodStarted: boolean
  text: string
  dateLabel: string | null
}

const NEXT_REFRESH_DATE_FORMAT = 'yyyy-MM-dd HH:mm'

const REFRESH_PERIOD_STARTED_TEXT =
  "Bark's refresh period has started. " +
  'Keep this wallet unlocked and synced until the refresh finishes.'

function unlockAroundText(dateLabel: string): string {
  return (
    `Unlock this wallet around ${dateLabel} so Bark can refresh your VTXOs. ` +
    'Bark has no delegate that can refresh them while the wallet is locked.'
  )
}

export function formatBarkNextRefreshHint(input: {
  nextRefresh: BarkNextRefreshObservation | null
  networkMode: BarkBitcoinNetwork
}): BarkNextRefreshHint | null {
  const { nextRefresh, networkMode } = input
  if (nextRefresh == null) return null

  const blocksUntilRefresh = nextRefresh.nextRefreshHeight - nextRefresh.tipHeight
  if (blocksUntilRefresh <= 0) {
    return { periodStarted: true, text: REFRESH_PERIOD_STARTED_TEXT, dateLabel: null }
  }

  const estimatedStart = new Date(
    new Date(nextRefresh.observedAt).getTime() +
      blocksUntilRefresh * averageBitcoinBlockSeconds(networkMode) * 1000,
  )
  const dateLabel = format(estimatedStart, NEXT_REFRESH_DATE_FORMAT)
  return { periodStarted: false, text: unlockAroundText(dateLabel), dateLabel }
}
