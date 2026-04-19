import { describe, it, expect } from 'vitest'
import {
  DEFAULT_NWC_CONNECTION_LABEL_BASE,
  isReservedDefaultNwcConnectionLabel,
  resolveDefaultNwcConnectionLabel,
} from '@/lib/nwc-default-connection-label'

describe('resolveDefaultNwcConnectionLabel', () => {
  it('returns base when no conflict', () => {
    expect(resolveDefaultNwcConnectionLabel([])).toBe(
      DEFAULT_NWC_CONNECTION_LABEL_BASE,
    )
    expect(resolveDefaultNwcConnectionLabel(['Other'])).toBe(
      DEFAULT_NWC_CONNECTION_LABEL_BASE,
    )
  })

  it('uses (1), (2), … when base and numbered names are taken', () => {
    expect(
      resolveDefaultNwcConnectionLabel([DEFAULT_NWC_CONNECTION_LABEL_BASE]),
    ).toBe(`${DEFAULT_NWC_CONNECTION_LABEL_BASE}(1)`)
    expect(
      resolveDefaultNwcConnectionLabel([
        DEFAULT_NWC_CONNECTION_LABEL_BASE,
        `${DEFAULT_NWC_CONNECTION_LABEL_BASE}(1)`,
      ]),
    ).toBe(`${DEFAULT_NWC_CONNECTION_LABEL_BASE}(2)`)
  })

  it('fills first gap if a numbered slot is missing', () => {
    expect(
      resolveDefaultNwcConnectionLabel([
        DEFAULT_NWC_CONNECTION_LABEL_BASE,
        `${DEFAULT_NWC_CONNECTION_LABEL_BASE}(2)`,
      ]),
    ).toBe(`${DEFAULT_NWC_CONNECTION_LABEL_BASE}(1)`)
  })
})

describe('isReservedDefaultNwcConnectionLabel', () => {
  it('matches base and numbered auto labels', () => {
    expect(isReservedDefaultNwcConnectionLabel(DEFAULT_NWC_CONNECTION_LABEL_BASE)).toBe(
      true,
    )
    expect(
      isReservedDefaultNwcConnectionLabel(`${DEFAULT_NWC_CONNECTION_LABEL_BASE}(1)`),
    ).toBe(true)
    expect(
      isReservedDefaultNwcConnectionLabel(`${DEFAULT_NWC_CONNECTION_LABEL_BASE}(42)`),
    ).toBe(true)
  })

  it('does not match custom or partial strings', () => {
    expect(isReservedDefaultNwcConnectionLabel('My custom wallet')).toBe(false)
    expect(isReservedDefaultNwcConnectionLabel(`${DEFAULT_NWC_CONNECTION_LABEL_BASE} `)).toBe(
      false,
    )
    expect(
      isReservedDefaultNwcConnectionLabel(`${DEFAULT_NWC_CONNECTION_LABEL_BASE}(1a)`),
    ).toBe(false)
    expect(
      isReservedDefaultNwcConnectionLabel(`x${DEFAULT_NWC_CONNECTION_LABEL_BASE}`),
    ).toBe(false)
  })
})
