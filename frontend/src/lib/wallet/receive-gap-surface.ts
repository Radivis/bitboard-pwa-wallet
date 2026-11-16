/** Trailing unused external addresses that still fit a normal scan, and the first count that needs a confirmation. */
export const RECEIVE_GAP_CONFIRM_MIN = 1
export const RECEIVE_GAP_LABEL_MIN = 2
export const RECEIVE_GAP_HARD_MIN = 20

export type ReceiveGapConfirmKind = 'none' | 'soft' | 'hard'

export interface ExternalReceiveGapReading {
  revealed: boolean
  index: number
  receiveCount: number
  gap: number
}

export type ReceiveGapSurface =
  | { kind: 'hidden' }
  | {
      kind: 'visible'
      receiveCount: number
      gapLabel: string | null
      generateConfirm: ReceiveGapConfirmKind
    }

export function confirmKindForGap(gap: number): ReceiveGapConfirmKind {
  if (gap >= RECEIVE_GAP_HARD_MIN) return 'hard'
  if (gap >= RECEIVE_GAP_CONFIRM_MIN) return 'soft'
  return 'none'
}

export function paymentsToAddressLabel(receiveCount: number): string {
  return `Payments to this address: ${receiveCount}`
}

export function unusedGapLabel(gap: number): string {
  return `Unused gap: ${gap}. A normal wallet looks ahead ${RECEIVE_GAP_HARD_MIN} addresses.`
}

export function softGapConfirmBody(gap: number): string {
  const unusedAfterGenerate = gap + 1
  const unusedAddresses =
    unusedAfterGenerate === 1 ? '1 unused address' : `${unusedAfterGenerate} unused addresses`
  return `Generating another address leaves ${unusedAddresses} in a row. Wallets that recover from a seed look ahead ${RECEIVE_GAP_HARD_MIN}. You can keep sharing this one.`
}

export function hardGapConfirmBody(): string {
  return `The next address is past the ${RECEIVE_GAP_HARD_MIN} unused scripts a normal scan queries. The coins are not destroyed. This wallet can still see them because it stores the revealed index. A restore from the seed alone, and another wallet with a gap of ${RECEIVE_GAP_HARD_MIN}, will not look that far.`
}

export const HARD_GAP_OPT_IN_LABEL =
  'I understand a normal wallet may not find funds sent to the next address.'

export const SOFT_GAP_CONFIRM_TITLE = 'This address has not been paid'
export const HARD_GAP_CONFIRM_TITLE = 'This address will be past the gap limit'
export const SOFT_GAP_KEEP_LABEL = 'Keep this address'
export const SOFT_GAP_GENERATE_LABEL = 'Generate new address'
export const HARD_GAP_GENERATE_LABEL = 'Generate past the gap limit'

/**
 * Public networks stay hidden until some successful Esplora sync exists.
 * Labnet uses the local chain as soon as the page asks.
 * This gates the payment count and the soft confirmation. The hard opt-in
 * uses {@link generateConfirmKindForClick} and does not wait for this.
 */
export function chainHistoryObserved(input: {
  networkMode: string
  lastSyncTime: Date | null | undefined
  lastSuccessfulEsploraSyncAt?: string
}): boolean {
  if (input.networkMode === 'lab') return true
  return input.lastSyncTime != null || input.lastSuccessfulEsploraSyncAt != null
}

/**
 * Click decision for Generate.
 * A gap of 1–19 before chain history does not confirm: payments not fetched
 * yet only shrink the gap, so that warning would often be wrong.
 * A gap of 20 or more still asks for the hard opt-in. That local upper bound
 * is already past a normal scan. An unrevealed wallet reveals with no modal.
 */
export function generateConfirmKindForClick(input: {
  chainObserved: boolean
  reading: ExternalReceiveGapReading
}): ReceiveGapConfirmKind {
  if (!input.reading.revealed) return 'none'
  const kind = confirmKindForGap(input.reading.gap)
  if (!input.chainObserved && kind !== 'hard') return 'none'
  return kind
}

export function receiveGapSurface(input: {
  chainObserved: boolean
  reading: ExternalReceiveGapReading | null
}): ReceiveGapSurface {
  if (!input.chainObserved || input.reading == null || !input.reading.revealed) {
    return { kind: 'hidden' }
  }
  const { receiveCount, gap } = input.reading
  return {
    kind: 'visible',
    receiveCount,
    gapLabel: gap >= RECEIVE_GAP_LABEL_MIN ? unusedGapLabel(gap) : null,
    generateConfirm: confirmKindForGap(gap),
  }
}
