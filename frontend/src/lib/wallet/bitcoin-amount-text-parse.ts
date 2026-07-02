import {
  type BitcoinDisplayUnit,
  BITCOIN_DISPLAY_UNIT_LABEL,
  parseAmountToSatsFromBitcoinDisplayUnit,
} from '@/lib/wallet/bitcoin-display-unit'

type FormattedUnitLabelPattern = {
  /** Substring to search for in the DOM text (e.g. `mBTC`, or ` ` + `BTC` for the base unit). */
  labelInDomText: string
  displayUnit: BitcoinDisplayUnit
  /**
   * When the substring appears but is a suffix of a longer unit (e.g. `sat` inside `ksat`,
   * or `BTC` inside `mBTC`), return true so that match is ignored.
   */
  isEmbeddedSuffixAt?: (labelStartIndex: number, fullText: string) => boolean
}

/**
 * How {@link BitcoinAmountDisplay} joins amount + label in the DOM: numeric span,
 * a space, then the unit (button, select, or span).
 * Substrings are listed so longer / more specific labels are preferred when two matches
 * start at the same index (e.g. `mBTC` over a trailing `BTC` inside it).
 */
const FORMATTED_UNIT_LABEL_PATTERNS: FormattedUnitLabelPattern[] = [
  { labelInDomText: ' Lab BTC', displayUnit: 'BTC' },
  { labelInDomText: 'Lab BTC', displayUnit: 'BTC' },
  { labelInDomText: ' Lab mBTC', displayUnit: 'mBTC' },
  { labelInDomText: 'Lab mBTC', displayUnit: 'mBTC' },
  { labelInDomText: ` Lab ${BITCOIN_DISPLAY_UNIT_LABEL.uBTC}`, displayUnit: 'uBTC' },
  { labelInDomText: `Lab ${BITCOIN_DISPLAY_UNIT_LABEL.uBTC}`, displayUnit: 'uBTC' },
  { labelInDomText: ' Lab ksat', displayUnit: 'ksat' },
  { labelInDomText: 'Lab ksat', displayUnit: 'ksat' },
  { labelInDomText: ' Lab sat', displayUnit: 'sat' },
  { labelInDomText: 'Lab sat', displayUnit: 'sat' },
  { labelInDomText: ' tmBTC', displayUnit: 'mBTC' },
  { labelInDomText: 'tmBTC', displayUnit: 'mBTC' },
  { labelInDomText: ` t${BITCOIN_DISPLAY_UNIT_LABEL.uBTC}`, displayUnit: 'uBTC' },
  { labelInDomText: `t${BITCOIN_DISPLAY_UNIT_LABEL.uBTC}`, displayUnit: 'uBTC' },
  { labelInDomText: ' tuBTC', displayUnit: 'uBTC' },
  { labelInDomText: 'tuBTC', displayUnit: 'uBTC' },
  { labelInDomText: ' tksat', displayUnit: 'ksat' },
  { labelInDomText: 'tksat', displayUnit: 'ksat' },
  {
    labelInDomText: ' tsat',
    displayUnit: 'sat',
    isEmbeddedSuffixAt: (labelStartIndex, fullText) =>
      labelStartIndex > 0 &&
      (fullText[labelStartIndex - 1] === 'k' || fullText[labelStartIndex - 1] === 'K'),
  },
  {
    labelInDomText: 'tsat',
    displayUnit: 'sat',
    isEmbeddedSuffixAt: (labelStartIndex, fullText) =>
      labelStartIndex > 0 &&
      (fullText[labelStartIndex - 1] === 'k' || fullText[labelStartIndex - 1] === 'K'),
  },
  { labelInDomText: ' tBTC', displayUnit: 'BTC' },
  {
    labelInDomText: 'tBTC',
    displayUnit: 'BTC',
    isEmbeddedSuffixAt: (labelStartIndex, fullText) =>
      labelStartIndex > 0 &&
      (fullText[labelStartIndex - 1] === 'm' || fullText[labelStartIndex - 1] === 'M'),
  },
  { labelInDomText: 'mBTC', displayUnit: 'mBTC' },
  { labelInDomText: BITCOIN_DISPLAY_UNIT_LABEL.uBTC, displayUnit: 'uBTC' },
  { labelInDomText: 'uBTC', displayUnit: 'uBTC' },
  { labelInDomText: 'ksat', displayUnit: 'ksat' },
  {
    labelInDomText: 'sat',
    displayUnit: 'sat',
    isEmbeddedSuffixAt: (labelStartIndex, fullText) =>
      labelStartIndex > 0 &&
      (fullText[labelStartIndex - 1] === 'k' || fullText[labelStartIndex - 1] === 'K'),
  },
  { labelInDomText: ' BTC', displayUnit: 'BTC' },
  {
    labelInDomText: 'BTC',
    displayUnit: 'BTC',
    isEmbeddedSuffixAt: (labelStartIndex, fullText) =>
      (labelStartIndex > 0 &&
        (fullText[labelStartIndex - 1] === 'm' || fullText[labelStartIndex - 1] === 'M')) ||
      (labelStartIndex >= 4 && fullText.slice(labelStartIndex - 4, labelStartIndex) === 'Lab '),
  },
]

function normalizeNumberTokenForUnit(raw: string, displayUnit: BitcoinDisplayUnit): string {
  const trimmed = raw.trim()
  if (displayUnit === 'sat') {
    return trimmed.replace(/[\s,']/g, '')
  }
  return trimmed.replace(/,/g, '')
}

// \u00a0 = U+00A0 NO-BREAK SPACE (NBSP)
// \u202F = U+202F NARROW NO-BREAK SPACE (NNBSP)
const AMOUNT_NUMBER_BEFORE_LABEL = /([\d.,\s\u00a0\u202F]+)\s*$/

/**
 * The numeric token immediately before a unit label, e.g. "0.00100000" or "1.00000"
 * (line breaks in `fullText` are folded to spaces; result is trimmed).
 */
function extractAmountStringBeforeLabelAt(fullText: string, labelStartIndex: number): string {
  const textUpToLabel = fullText.slice(0, labelStartIndex)
  const numericRunMatch = AMOUNT_NUMBER_BEFORE_LABEL.exec(textUpToLabel)
  if (numericRunMatch != null) {
    return numericRunMatch[1]!.replace(/\n/g, ' ').trim()
  }
  return ''
}

type NextFormattedDisplayMatch = {
  consumeToIndex: number
  displayUnit: BitcoinDisplayUnit
  amountString: string
}

/**
 * The leftmost (then longest-label) formatted amount+unit in `fullText` starting at `searchFrom`.
 */
function findNextFormattedDisplayMatch(
  fullText: string,
  searchFrom: number,
): NextFormattedDisplayMatch | null {
  const matchCandidates: { labelStartIndex: number; pattern: FormattedUnitLabelPattern }[] = []
  for (const pattern of FORMATTED_UNIT_LABEL_PATTERNS) {
    const labelStartIndex = fullText.indexOf(pattern.labelInDomText, searchFrom)
    if (labelStartIndex < 0) {
      continue
    }
    if (pattern.isEmbeddedSuffixAt?.(labelStartIndex, fullText)) {
      continue
    }
    matchCandidates.push({ labelStartIndex, pattern })
  }
  if (matchCandidates.length === 0) {
    return null
  }
  matchCandidates.sort(
    (a, b) =>
      a.labelStartIndex - b.labelStartIndex ||
      b.pattern.labelInDomText.length - a.pattern.labelInDomText.length,
  )
  const { labelStartIndex, pattern } = matchCandidates[0]!
  const consumeToIndex = labelStartIndex + pattern.labelInDomText.length
  const amountString = extractAmountStringBeforeLabelAt(fullText, labelStartIndex)
  return { consumeToIndex, displayUnit: pattern.displayUnit, amountString }
}

export type ParseFormattedBitcoinDisplayOptions = {
  /**
   * When true, include formatted segments that resolve to 0 sats (e.g. dashboard headline).
   * Default false so dust/review flows that scan visible amounts ignore empty-looking rows.
   */
  includeZeroSats?: boolean
}

/**
 * Inverts the visible (amount + space + unit) strings produced with
 * `formatAmountInBitcoinDisplayUnit` + `BITCOIN_DISPLAY_UNIT_LABEL`, in document order.
 */
export function parseAllSatsInTextFromFormattedBitcoinAmountDisplays(
  text: string,
  options?: ParseFormattedBitcoinDisplayOptions,
): number[] {
  const includeZero = options?.includeZeroSats ?? false
  const normalizedText = text.replace(/\u00a0/g, ' ').replace(/\r/g, '\n')
  const satsInOrder: number[] = []
  let searchFrom = 0
  while (searchFrom < normalizedText.length) {
    const next = findNextFormattedDisplayMatch(normalizedText, searchFrom)
    if (next == null) {
      break
    }
    if (next.amountString.length === 0) {
      searchFrom = next.consumeToIndex
      continue
    }
    const satsFromSegment = parseAmountToSatsFromBitcoinDisplayUnit(
      normalizeNumberTokenForUnit(next.amountString, next.displayUnit),
      next.displayUnit,
    )
    if (satsFromSegment > 0 || (includeZero && satsFromSegment === 0)) {
      satsInOrder.push(satsFromSegment)
    }
    searchFrom = next.consumeToIndex
  }
  return satsInOrder
}

/**
 * Max satoshi value among formatted {@link BitcoinAmountDisplay} segments in the text.
 * Useful for dashboard cards with several amounts (e.g. headline + breakdown).
 */
export function maxSatsInTextFromFormattedBitcoinAmountDisplays(text: string): number {
  const allParsedSats = parseAllSatsInTextFromFormattedBitcoinAmountDisplays(text)
  if (allParsedSats.length === 0) {
    return 0
  }
  return Math.max(...allParsedSats)
}

/**
 * True if any display segment matches `expectedSats` exactly, or the integer appears as a word
 * (toasts that say "546 sats" without a full `BitcoinAmountDisplay` row).
 */
export function textReflectsSatsInFormattedDisplaysOrLiteral(
  text: string,
  expectedSats: number,
): boolean {
  if (!Number.isInteger(expectedSats) || expectedSats < 0) {
    return false
  }
  const satsFromDisplays = parseAllSatsInTextFromFormattedBitcoinAmountDisplays(text)
  if (satsFromDisplays.some((sats) => sats === expectedSats)) {
    return true
  }
  return new RegExp(`\\b${expectedSats}\\b`).test(text)
}
