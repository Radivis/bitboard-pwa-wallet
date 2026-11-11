import { createHash } from 'node:crypto'

const BECH32_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l'

/**
 * Script BDK asks Esplora for: `sha256(scriptPubKey)`, forward bytes.
 * Witness v0 is opcode 0. Witness v1–v16 are OP_1–OP_16 (0x51–0x60), not the version number.
 */
export function bdkEsploraScripthashHex(address: string): string {
  const separatorIndex = address.lastIndexOf('1')
  const payloadChars = address.slice(separatorIndex + 1).toLowerCase()
  const fiveBitPayload = [...payloadChars].map((character) => {
    const charsetIndex = BECH32_CHARSET.indexOf(character)
    if (charsetIndex < 0) {
      throw new Error(`Address ${address} is not bech32`)
    }
    return charsetIndex
  })
  if (fiveBitPayload.length < 7) {
    throw new Error(`Address ${address} is not bech32`)
  }
  const witnessVersion = fiveBitPayload[0]
  const witnessProgram = convertBech32Bits(fiveBitPayload.slice(1, -6), 5, 8, false)
  if (witnessVersion == null || witnessProgram == null || witnessProgram.length === 0) {
    throw new Error(`Address ${address} has no witness program`)
  }
  const script = Buffer.from([
    witnessVersionOpcode(witnessVersion),
    witnessProgram.length,
    ...witnessProgram,
  ])
  return createHash('sha256').update(script).digest('hex')
}

function witnessVersionOpcode(witnessVersion: number): number {
  if (witnessVersion === 0) {
    return 0
  }
  if (witnessVersion >= 1 && witnessVersion <= 16) {
    return 0x50 + witnessVersion
  }
  throw new Error(`Witness version ${witnessVersion} is not a script opcode`)
}

function convertBech32Bits(
  data: number[],
  fromBits: number,
  toBits: number,
  pad: boolean,
): number[] | null {
  let accumulator = 0
  let bitCount = 0
  const converted: number[] = []
  const maxValue = (1 << toBits) - 1
  for (const value of data) {
    accumulator = (accumulator << fromBits) | value
    bitCount += fromBits
    while (bitCount >= toBits) {
      bitCount -= toBits
      converted.push((accumulator >> bitCount) & maxValue)
    }
  }
  if (pad) {
    if (bitCount > 0) {
      converted.push((accumulator << (toBits - bitCount)) & maxValue)
    }
    return converted
  }
  const leftoverBitsArePadding =
    bitCount < fromBits && ((accumulator << (toBits - bitCount)) & maxValue) === 0
  return leftoverBitsArePadding ? converted : null
}
