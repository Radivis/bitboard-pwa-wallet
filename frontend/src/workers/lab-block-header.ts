import type { LabBlockHeaderDetails } from './lab-api'

/** Bitcoin block header size in bytes. */
const BLOCK_HEADER_BYTE_LENGTH = 80

/** Hex-encoded header length (two hex digits per byte). */
const BLOCK_HEADER_HEX_LENGTH = BLOCK_HEADER_BYTE_LENGTH * 2

/** Start offset in header hex for prev block hash field (after 4-byte version). */
const PREV_BLOCK_HASH_HEX_START = 8

/** End offset (exclusive) for prev block hash in header hex. */
const PREV_BLOCK_HASH_HEX_END = 72

/** Merkle root field in header hex (32 bytes after prev hash). */
const MERKLE_ROOT_HEX_START = PREV_BLOCK_HASH_HEX_END

/** End offset (exclusive) for merkle root in header hex. */
const MERKLE_ROOT_HEX_END = 136

function hexToBytes(hex: string): Uint8Array {
  const normalizedHex = hex.length % 2 === 0 ? hex : `0${hex}`
  const out = new Uint8Array(normalizedHex.length / 2)
  for (let i = 0; i < out.length; i += 1) {
    out[i] = parseInt(normalizedHex.slice(i * 2, i * 2 + 2), 16)
  }
  return out
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

function reverseHexByteOrder(hex: string): string {
  return bytesToHex(hexToBytes(hex).reverse())
}

function readUint32Le(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset] |
    (bytes[offset + 1] << 8) |
    (bytes[offset + 2] << 16) |
    (bytes[offset + 3] << 24)
  ) >>> 0
}

async function sha256(data: Uint8Array): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(data).buffer)
  return new Uint8Array(digest)
}

async function doubleSha256(data: Uint8Array): Promise<Uint8Array> {
  const first = await sha256(data)
  return sha256(first)
}

/**
 * Bitcoin compact nBits → full 256-bit proof-of-work target as a 64-char big-endian hex string.
 */
function expandTargetFromBits(bits: number): string {
  const exponent = bits >>> 24
  const mantissa = bits & 0x007fffff
  if (mantissa === 0) return '0'.repeat(64)
  const shiftBytes = exponent - 3
  const value = shiftBytes >= 0
    ? BigInt(mantissa) << BigInt(8 * shiftBytes)
    : BigInt(mantissa) >> BigInt(8 * -shiftBytes)
  return value.toString(16).padStart(64, '0')
}

export async function parseBlockHeader(blockHex: string): Promise<LabBlockHeaderDetails> {
  const headerHex = blockHex.slice(0, BLOCK_HEADER_HEX_LENGTH)
  const headerBytes = hexToBytes(headerHex)
  if (headerBytes.length < BLOCK_HEADER_BYTE_LENGTH) {
    throw new Error(`Block header must be ${BLOCK_HEADER_BYTE_LENGTH} bytes`)
  }
  const version = readUint32Le(headerBytes, 0)
  const previousBlockHash = reverseHexByteOrder(
    headerHex.slice(PREV_BLOCK_HASH_HEX_START, PREV_BLOCK_HASH_HEX_END),
  )
  const merkleRoot = reverseHexByteOrder(
    headerHex.slice(MERKLE_ROOT_HEX_START, MERKLE_ROOT_HEX_END),
  )
  const timestamp = readUint32Le(headerBytes, 68)
  const bits = readUint32Le(headerBytes, 72)
  const nonce = readUint32Le(headerBytes, 76)
  const targetBits = bits.toString(16).padStart(8, '0')
  const targetExpanded = expandTargetFromBits(bits)
  const blockHeaderHash = bytesToHex((await doubleSha256(headerBytes)).reverse())

  return {
    version,
    previousBlockHash,
    merkleRoot,
    timestamp,
    targetBits,
    targetExpanded,
    nonce,
    blockHeaderHash,
  }
}
