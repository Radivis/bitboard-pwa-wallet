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

export const RECEIVE_PAYMENT_COUNT_INFO_TITLE = 'Payments to this address'

export const RECEIVE_PAYMENT_COUNT_INFO_TEXT =
  'This count matters for privacy. Each extra payment to the same address is address reuse: observers can link those payments to one recipient, which is a common way to deanonymize a wallet. A count of 0 means this address is still fresh.'

export function paymentsToAddressLabel(receiveCount: number): string {
  return `Payments to this address: ${receiveCount}`
}

export const RECEIVE_UNUSED_GAP_INFO_TITLE = 'Unused gap'

export const RECEIVE_UNUSED_GAP_INFO_TEXT = `The gap is how many addresses in a row have been revealed since the last one that was paid. A normal wallet stops scanning after ${RECEIVE_GAP_HARD_MIN} unused addresses. Going past that limit does not destroy coins, but a restore from the seed alone, and most other wallets, will not look far enough to find them. This wallet still can, because it remembers every address it revealed. Generating past ${RECEIVE_GAP_HARD_MIN} asks you to opt in to that breakage.`

export function unusedGapLabel(gap: number): string {
  return `Unused gap: ${gap}. A normal wallet looks ahead ${RECEIVE_GAP_HARD_MIN} addresses.`
}

export function softGapConfirmBody(gap: number): string {
  const unusedAddresses = gap === 1 ? '1 unused address' : `${gap} unused addresses`
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
 */
export function chainHistoryObserved(input: {
  networkMode: string
  lastSyncTime: Date | null | undefined
  lastSuccessfulEsploraSyncAt?: string
}): boolean {
  if (input.networkMode === 'lab') return true
  return input.lastSyncTime != null || input.lastSuccessfulEsploraSyncAt != null
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
