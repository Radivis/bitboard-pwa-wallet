import {
  NON_ESPLORA_FEE_PRESET_RATES_SAT_PER_VB,
  estimateSatPerVbForTarget,
  fetchFeeEstimates,
  formatSatPerVbTwoDecimals,
  parseFeeEstimatesJson,
  pickPresetRatesFromEsploraOrFallback,
  MAX_FEE_RATE_SAT_PER_VB,
} from '@/lib/esplora-fee-estimates'

describe('parseFeeEstimatesJson', () => {
  it('keeps numeric string keys and positive finite fees', () => {
    expect(
      parseFeeEstimatesJson({
        '1': 12.5,
        '6': 5,
        '144': 1.02,
      }),
    ).toEqual({ '1': 12.5, '6': 5, '144': 1.02 })
  })

  it('drops NaN non-positive junk keys', () => {
    expect(
      parseFeeEstimatesJson({
        '1': 2,
        'x': 3,
        '6': NaN,
        '7': -1,
        blob: {},
      }),
    ).toEqual({ '1': 2 })
  })

  it('caps at MAX_FEE_RATE_SAT_PER_VB', () => {
    expect(parseFeeEstimatesJson({ '1': MAX_FEE_RATE_SAT_PER_VB + 1 })).toEqual({
      '1': MAX_FEE_RATE_SAT_PER_VB,
    })
  })
})

describe('estimateSatPerVbForTarget', () => {
  const map = { '3': 8, '6': 4, '25': 1.01 } as Record<string, number>

  it('returns exact match', () => {
    expect(estimateSatPerVbForTarget(map, 6)).toBe(4)
  })

  it('uses smallest key >= requested when exact missing', () => {
    expect(estimateSatPerVbForTarget(map, 144)).toBe(1.01)
    expect(estimateSatPerVbForTarget(map, 24)).toBe(1.01)
  })

  it('falls back to max key when requested above all targets', () => {
    expect(estimateSatPerVbForTarget({ '144': 0.02, '6': 0.08 }, 1)).toBe(
      0.08,
    )
  })
})

describe('pickPresetRatesFromEsploraOrFallback', () => {
  it('uses fallback when estimates empty', () => {
    expect(pickPresetRatesFromEsploraOrFallback(null)).toEqual({
      ...NON_ESPLORA_FEE_PRESET_RATES_SAT_PER_VB,
    })
  })

  it('fills from map when keys exist', () => {
    expect(
      pickPresetRatesFromEsploraOrFallback({
        '1': 42,
        '6': 6,
        '144': 0.51,
      }),
    ).toEqual({ Low: 0.51, Medium: 6, High: 42 })
  })
})

describe('formatSatPerVbTwoDecimals', () => {
  it('shows two fractional digits', () => {
    expect(formatSatPerVbTwoDecimals(2)).toBe('2.00')
    expect(formatSatPerVbTwoDecimals(0.2)).toBe('0.20')
  })
})

describe('fetchFeeEstimates', () => {
  it('parses OK response JSON', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ '1': 3, '6': 1.01 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    const out = await fetchFeeEstimates('https://example.com/api')
    expect(out).toEqual({ '1': 3, '6': 1.01 })
    expect(fetchSpy).toHaveBeenCalledWith('https://example.com/api/fee-estimates')
    fetchSpy.mockRestore()
  })

  it('throws on HTTP error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('', { status: 502 }),
    )
    await expect(fetchFeeEstimates('https://x/api')).rejects.toThrow(
      /HTTP 502/,
    )
    vi.restoreAllMocks()
  })
})
