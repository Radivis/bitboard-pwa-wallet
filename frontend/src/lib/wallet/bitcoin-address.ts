import { bech32, bech32m } from '@scure/base'
import type { NetworkMode } from '@/stores/walletStore'

const SEGWIT_HUMAN_READABLE_PART_BY_NETWORK: Record<NetworkMode, string> = {
  mainnet: 'bc',
  testnet: 'tb',
  signet: 'tb',
  mutinynet: 'tb',
  regtest: 'bcrt',
  lab: 'bcrt',
}

/** rust-bitcoin rejects a legacy string longer than this before checking the checksum. */
const LEGACY_ADDRESS_MAX_LENGTH = 50
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'

const WITNESS_V0 = 0
const WITNESS_V1 = 1
const MAX_WITNESS_VERSION = 16
const WITNESS_V0_PROGRAM_LENGTHS = [20, 32]
const WITNESS_V1_PROGRAM_LENGTH = 32
const SEGWIT_HUMAN_READABLE_PARTS_LONGEST_FIRST = ['bcrt', 'tb', 'bc'] as const

type SegwitCodec = typeof bech32

type DecodedSegwit = {
  humanReadablePart: string
  version: number
  programLength: number
}

function isValidWitnessProgramLength(
  version: number,
  programLength: number,
): boolean {
  if (version === WITNESS_V0) {
    return WITNESS_V0_PROGRAM_LENGTHS.includes(programLength)
  }
  if (version === WITNESS_V1) {
    return programLength === WITNESS_V1_PROGRAM_LENGTH
  }
  return false
}

function decodeSegwit(address: string, codec: SegwitCodec): DecodedSegwit | null {
  const decoded = codec.decodeUnsafe(address)
  if (decoded == null) return null
  const version = decoded.words[0]
  if (version == null || version > MAX_WITNESS_VERSION) return null
  const program = codec.fromWordsUnsafe(decoded.words.slice(1))
  if (program == null || !isValidWitnessProgramLength(version, program.length)) return null
  return {
    humanReadablePart: decoded.prefix,
    version,
    programLength: program.length,
  }
}

function isValidSegwitAddress(
  address: string,
  humanReadablePart: string,
): boolean {
  const versionZero = decodeSegwit(address, bech32)
  if (
    versionZero != null &&
    versionZero.version === WITNESS_V0 &&
    versionZero.humanReadablePart === humanReadablePart
  ) {
    return true
  }

  const laterVersion = decodeSegwit(address, bech32m)
  return (
    laterVersion != null &&
    laterVersion.version >= 1 &&
    laterVersion.humanReadablePart === humanReadablePart
  )
}

function segwitHumanReadablePart(address: string): string | null {
  const lowered = address.toLowerCase()
  for (const humanReadablePart of SEGWIT_HUMAN_READABLE_PARTS_LONGEST_FIRST) {
    if (lowered.startsWith(`${humanReadablePart}1`)) return humanReadablePart
  }
  return null
}

function looksLikeSegwitForNetwork(
  address: string,
  humanReadablePart: string,
): boolean {
  return segwitHumanReadablePart(address) === humanReadablePart
}

/**
 * True when `address` decodes as a standard segwit program for `network`.
 * Legacy base58 is checked by the crypto worker (`bitcoin_address_is_valid`).
 * A string that looks like segwit but fails checksum or program-length checks
 * is invalid and is not sent to the worker.
 */
export function isValidAddress(address: string, network: NetworkMode): boolean {
  return isValidSegwitAddress(
    address,
    SEGWIT_HUMAN_READABLE_PART_BY_NETWORK[network],
  )
}

function isBase58Candidate(address: string): boolean {
  if (address.length === 0 || address.length > LEGACY_ADDRESS_MAX_LENGTH) {
    return false
  }
  for (const character of address) {
    if (!BASE58_ALPHABET.includes(character)) return false
  }
  return true
}

/** True when only the crypto worker can decide whether this string is a payable address. */
export function addressNeedsWorkerCheck(
  address: string,
  network: NetworkMode,
): boolean {
  const humanReadablePart = SEGWIT_HUMAN_READABLE_PART_BY_NETWORK[network]
  if (isValidSegwitAddress(address, humanReadablePart)) return false
  if (looksLikeSegwitForNetwork(address, humanReadablePart)) return false
  return isBase58Candidate(address)
}
