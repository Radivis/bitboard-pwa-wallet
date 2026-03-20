import { describe, it, expect } from 'vitest'
import { generate_mnemonic } from '@/wasm-pkg/bitboard_crypto'

describe('WASM smoke test', () => {
  it('calls generate_mnemonic and returns 12-word mnemonic', () => {
    const result = generate_mnemonic(12)
    expect(result).toBeDefined()
    const words = (result as string).trim().split(/\s+/)
    expect(words).toHaveLength(12)
  })
})
