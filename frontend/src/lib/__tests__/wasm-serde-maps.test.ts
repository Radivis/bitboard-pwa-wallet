import { describe, expect, it } from 'vitest'
import { wasmSerdeValueToPlainJson } from '../wasm-serde-maps'

describe('wasmSerdeValueToPlainJson', () => {
  it('turns nested Maps into plain objects like lab_block_effects output', () => {
    const raw = new Map<string, unknown>([
      [
        'new_utxos',
        [
          new Map<string, unknown>([
            ['txid', 'abc'],
            ['vout', 0],
            ['address', 'bcrt1qtest'],
            ['amount_sats', 5_000_000_000],
            ['script_pubkey_hex', '0014aa'],
          ]),
        ],
      ],
      ['spent', []],
      ['transactions', []],
      ['block_time', 123],
    ])
    const plain = wasmSerdeValueToPlainJson(raw) as Record<string, unknown>
    expect(Array.isArray(plain.new_utxos)).toBe(true)
    const row = (plain.new_utxos as Record<string, unknown>[])[0]
    expect(row.txid).toBe('abc')
    expect(row.amount_sats).toBe(5_000_000_000)
  })

  it('leaves plain objects unchanged', () => {
    const o = { a: 1, b: [{ c: 2 }] }
    expect(wasmSerdeValueToPlainJson(o)).toEqual(o)
  })
})
