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

const LEGACY_ADDRESS_PREFIXES: Record<NetworkMode, readonly string[]> = {
  mainnet: ['1', '3'],
  testnet: ['m', 'n', '2'],
  signet: [],
  mutinynet: [],
  regtest: [],
  lab: [],
}

const WITNESS_V0 = 0
const MAX_WITNESS_VERSION = 16
const MIN_WITNESS_PROGRAM_LENGTH = 2
const MAX_WITNESS_PROGRAM_LENGTH = 40
const WITNESS_V0_PROGRAM_LENGTHS = [20, 32]
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
  if (
    programLength < MIN_WITNESS_PROGRAM_LENGTH ||
    programLength > MAX_WITNESS_PROGRAM_LENGTH
  ) {
    return false
  }
  if (version === WITNESS_V0) {
    return WITNESS_V0_PROGRAM_LENGTHS.includes(programLength)
  }
  return version >= 1 && version <= MAX_WITNESS_VERSION
}

function decodeSegwit(address: string, codec: SegwitCodec): DecodedSegwit | null {
  try {
    const decoded = codec.decode(address)
    const version = decoded.words[0]
    if (version == null || version > MAX_WITNESS_VERSION) return null
    const program = codec.fromWords(decoded.words.slice(1))
    if (!isValidWitnessProgramLength(version, program.length)) return null
    return {
      humanReadablePart: decoded.prefix,
      version,
      programLength: program.length,
    }
  } catch {
    return null
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
 * True when `address` decodes as segwit for `network`, or matches a legacy
 * prefix that this network still accepts. A string that looks like segwit
 * but fails checksum or program-length checks is invalid.
 */
export function isValidAddress(address: string, network: NetworkMode): boolean {
  const humanReadablePart = SEGWIT_HUMAN_READABLE_PART_BY_NETWORK[network]
  if (isValidSegwitAddress(address, humanReadablePart)) return true
  if (looksLikeSegwitForNetwork(address, humanReadablePart)) return false
  return LEGACY_ADDRESS_PREFIXES[network].some((prefix) =>
    address.startsWith(prefix),
  )
}
