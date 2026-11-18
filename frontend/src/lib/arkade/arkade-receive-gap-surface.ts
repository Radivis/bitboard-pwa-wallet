import type { ArkadeOffchainReceiveGap } from '@/workers/arkade-api'
import {
  paymentsToAddressLabel,
  type ReceiveGapConfirmKind,
} from '@/lib/wallet/receive-gap-surface'

export type { ArkadeOffchainReceiveGap }

/** `discover_keys` batch size. Keep this aligned with `DEFAULT_GAP_LIMIT`. */
export const ARKADE_DISCOVERY_BATCH_SIZE = 20
export const ARKADE_RECEIVE_GAP_LABEL_MIN = 2
export const ARKADE_BATCH_GAP_HARD_MIN = 2

export type ArkadeReceiveGapSurface =
  | { kind: 'hidden' }
  | {
      kind: 'visible'
      receiveCount: number
      gapLabel: string | null
    }

export function arkadeGenerateConfirmKind(
  reading: ArkadeOffchainReceiveGap,
): ReceiveGapConfirmKind {
  if (!reading.revealed) return 'none'
  if (reading.batchGap >= ARKADE_BATCH_GAP_HARD_MIN) return 'hard'
  if (!reading.snapshotPresent) return 'none'
  if (reading.gap >= 1 || reading.receiveCount === 0) return 'soft'
  return 'none'
}

/** The address on screen sits past the batch a seed restore will query. */
export function arkadeCurrentIndexMissesRestore(reading: ArkadeOffchainReceiveGap): boolean {
  return reading.revealed && reading.displayedBatchGap >= ARKADE_BATCH_GAP_HARD_MIN
}

export function arkadeReceiveGapSurface(
  reading: ArkadeOffchainReceiveGap | null,
): ArkadeReceiveGapSurface {
  if (reading == null || !reading.snapshotPresent || !reading.revealed) {
    return { kind: 'hidden' }
  }
  return {
    kind: 'visible',
    receiveCount: reading.receiveCount,
    gapLabel:
      reading.gap >= ARKADE_RECEIVE_GAP_LABEL_MIN ? arkadeUnusedGapLabel(reading.gap) : null,
  }
}

export function arkadePaymentCountLabel(receiveCount: number): string {
  return paymentsToAddressLabel(receiveCount)
}

export function arkadeUnusedGapLabel(gap: number): string {
  return `Unused gap: ${gap}. A seed restore still scans one empty batch of ${ARKADE_DISCOVERY_BATCH_SIZE}.`
}

export function arkadeSoftGapConfirmBody(gap: number): string {
  if (gap <= 0) {
    return 'This Arkade address has not received a payment. A boarding deposit uses this key, and change from a send can land here, but neither is an incoming payment. You can keep sharing this address.'
  }
  const unusedAfterGenerate = gap + 1
  const unusedAddresses =
    unusedAfterGenerate === 1 ? '1 unused address' : `${unusedAfterGenerate} unused addresses`
  return `Generating another address leaves ${unusedAddresses} in a row. You can keep sharing this one.`
}

export function arkadeCurrentAddressRestoreWarning(): string {
  return `A seed restore will not ask about this address. It stops after one empty batch of ${ARKADE_DISCOVERY_BATCH_SIZE} keys. This wallet can still see funds sent here because it stores the revealed index.`
}

export function arkadeHardGapConfirmBody(): string {
  return `The next address is in a batch a seed restore will not query. Restore asks for ${ARKADE_DISCOVERY_BATCH_SIZE} keys at a time and stops after one empty batch past the last batch that had a payment. The coins are not destroyed. This wallet can still see them because it stores the revealed index. A restore from the seed alone will not ask about that batch.`
}

export const ARKADE_HARD_GAP_OPT_IN_LABEL =
  'I understand a seed restore may not find funds sent to the next address.'
