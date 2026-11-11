import { bech32m } from '@scure/base'
import { describe, expect, it } from 'vitest'
import { isValidAddress } from '../bitcoin-utils'
import { normalizeSendRecipient } from '../send/normalize-send-recipient'

/** BIP173 testnet P2WPKH vector. */
const TESTNET_P2WPKH = 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx'
/** BIP173 mainnet P2WPKH vector. */
const MAINNET_P2WPKH = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4'
/** Same witness program as the BIP173 mainnet P2WPKH vector, encoded for regtest. */
const REGTEST_P2WPKH = 'bcrt1qw508d6qejxtdg4y5r3zarvary0c5xw7kygt080'
/** Mutinynet receive address from the reported send failure. */
const MUTINYNET_P2TR =
  'tb1pca7a2yt9zwxccwclzl4l0qcaep0waxnk9jg75k44fq4sfnwa2l3sdn7zh9'

function encodeWitnessAddress(
  humanReadablePart: string,
  version: number,
  program: Uint8Array,
): string {
  return bech32m.encode(humanReadablePart, [version, ...bech32m.toWords(program)])
}

describe('isValidAddress', () => {
  it('accepts a decoded signet bech32 address', () => {
    expect(isValidAddress(TESTNET_P2WPKH, 'signet')).toBe(true)
    expect(isValidAddress(TESTNET_P2WPKH, 'mutinynet')).toBe(true)
    expect(isValidAddress(TESTNET_P2WPKH, 'testnet')).toBe(true)
  })

  it('accepts the reported mutinynet taproot address', () => {
    expect(isValidAddress(MUTINYNET_P2TR, 'mutinynet')).toBe(true)
    expect(isValidAddress(MUTINYNET_P2TR, 'signet')).toBe(true)
  })

  it('accepts an uppercase bech32 address', () => {
    expect(isValidAddress(MAINNET_P2WPKH.toUpperCase(), 'mainnet')).toBe(true)
  })

  it('rejects mixed-case bech32', () => {
    const mixedCase = `B${MAINNET_P2WPKH.slice(1)}`
    expect(isValidAddress(mixedCase, 'mainnet')).toBe(false)
  })

  it('rejects a bech32 address on the wrong network', () => {
    expect(isValidAddress(MAINNET_P2WPKH, 'signet')).toBe(false)
    expect(isValidAddress(TESTNET_P2WPKH, 'mainnet')).toBe(false)
  })

  it('rejects a segwit prefix that does not decode', () => {
    expect(isValidAddress('tb1q', 'signet')).toBe(false)
    expect(isValidAddress('tb1qnot-a-real-address', 'mutinynet')).toBe(false)
  })

  it('rejects a valid address with an embedded zero-width space', () => {
    const polluted = `${TESTNET_P2WPKH.slice(0, 10)}\u200B${TESTNET_P2WPKH.slice(10)}`
    expect(isValidAddress(polluted, 'signet')).toBe(false)
  })

  it('accepts a zero-width-space paste after send normalization', () => {
    const polluted = `${MUTINYNET_P2TR.slice(0, 20)}\u200B${MUTINYNET_P2TR.slice(20)}`
    expect(isValidAddress(normalizeSendRecipient(polluted), 'mutinynet')).toBe(
      true,
    )
  })

  it('accepts a regtest bech32 address', () => {
    expect(isValidAddress(REGTEST_P2WPKH, 'regtest')).toBe(true)
    expect(isValidAddress(REGTEST_P2WPKH, 'lab')).toBe(true)
    expect(isValidAddress(REGTEST_P2WPKH, 'signet')).toBe(false)
    expect(isValidAddress(REGTEST_P2WPKH, 'mainnet')).toBe(false)
  })

  it('rejects a witness v1 program that is not 32 bytes', () => {
    const shortTaproot = encodeWitnessAddress('bc', 1, new Uint8Array(20).fill(1))
    expect(isValidAddress(shortTaproot, 'mainnet')).toBe(false)
  })

  it('rejects a witness version above 1', () => {
    const futureVersion = encodeWitnessAddress('bc', 2, new Uint8Array(32).fill(2))
    expect(isValidAddress(futureVersion, 'mainnet')).toBe(false)
  })

  it('still accepts a legacy mainnet prefix', () => {
    expect(isValidAddress('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa', 'mainnet')).toBe(
      true,
    )
    expect(isValidAddress('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa', 'signet')).toBe(
      false,
    )
  })
})
