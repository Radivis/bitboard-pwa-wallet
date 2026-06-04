import type {
  InMemoryContractRepository,
  InMemoryWalletRepository,
} from '@arkade-os/sdk'
import {
  BITBOARD_ARKADE_SDK_PERSISTENCE_VERSION,
  type BitboardArkadeSdkPersistenceV1,
  type SerializedInMemoryContractRepositoryV1,
  type SerializedInMemoryWalletRepositoryV1,
} from '@/lib/arkade/arkade-sdk-persistence-types'
import { scheduleSdkPersistenceFlush } from '@/lib/arkade/storage/arkade-sdk-persistence-flush'

const BIGINT_TAG = '__bitboardBigInt'
const DATE_TAG = '__bitboardDate'
const MAP_TAG = '__bitboardMap'
const UINT8_TAG = '__bitboardUint8Array'

const WALLET_MUTATING_METHODS = new Set([
  'saveVtxos',
  'deleteVtxos',
  'saveVtxosForScript',
  'deleteVtxosForScript',
  'saveUtxos',
  'deleteUtxos',
  'saveTransactions',
  'deleteTransactions',
  'saveWalletState',
  'clear',
])

const CONTRACT_MUTATING_METHODS = new Set([
  'saveContract',
  'deleteContract',
  'clear',
])

type WalletRepoInternals = {
  version: number
  walletState: unknown
  vtxosByAddress: Map<unknown, unknown>
  utxosByAddress: Map<unknown, unknown>
  txsByAddress: Map<unknown, unknown>
}

type ContractRepoInternals = {
  version: number
  contractData: Map<unknown, unknown>
  collections: Map<unknown, unknown>
  contractsByScript: Map<unknown, unknown>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

type TaggedJson =
  | { [BIGINT_TAG]: string }
  | { [DATE_TAG]: string }
  | { [MAP_TAG]: unknown[] }
  | { [UINT8_TAG]: string }

function isTaggedJson(value: unknown): value is TaggedJson {
  return isRecord(value) && Object.keys(value).length === 1
}

function serializeUnknown(value: unknown): unknown {
  if (value === undefined) return null
  if (typeof value === 'bigint') {
    return { [BIGINT_TAG]: value.toString() }
  }
  if (value instanceof Date) {
    return { [DATE_TAG]: value.toISOString() }
  }
  if (value instanceof Uint8Array) {
    let binary = ''
    for (const byte of value) {
      binary += String.fromCharCode(byte)
    }
    return { [UINT8_TAG]: btoa(binary) }
  }
  if (value instanceof Map) {
    return {
      [MAP_TAG]: Array.from(value.entries()).map(([key, entry]) => [
        serializeUnknown(key),
        serializeUnknown(entry),
      ]),
    }
  }
  if (Array.isArray(value)) {
    return value.map((entry) => serializeUnknown(entry))
  }
  if (isRecord(value)) {
    const output: Record<string, unknown> = {}
    for (const [key, entry] of Object.entries(value)) {
      output[key] = serializeUnknown(entry)
    }
    return output
  }
  return value
}

function deserializeUnknown(value: unknown): unknown {
  if (!isTaggedJson(value)) {
    if (Array.isArray(value)) {
      return value.map((entry) => deserializeUnknown(entry))
    }
    if (isRecord(value)) {
      const output: Record<string, unknown> = {}
      for (const [key, entry] of Object.entries(value)) {
        output[key] = deserializeUnknown(entry)
      }
      return output
    }
    return value
  }

  if (BIGINT_TAG in value) {
    return BigInt(value[BIGINT_TAG])
  }
  if (DATE_TAG in value) {
    return new Date(value[DATE_TAG])
  }
  if (UINT8_TAG in value) {
    const binary = atob(value[UINT8_TAG])
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index)
    }
    return bytes
  }
  if (MAP_TAG in value) {
    const entries = value[MAP_TAG] as unknown[]
    const map = new Map<unknown, unknown>()
    for (const entry of entries) {
      if (!Array.isArray(entry) || entry.length !== 2) continue
      map.set(deserializeUnknown(entry[0]), deserializeUnknown(entry[1]))
    }
    return map
  }
  return value
}

function getWalletInternals(repository: InMemoryWalletRepository): WalletRepoInternals {
  return repository as unknown as WalletRepoInternals
}

function getContractInternals(
  repository: InMemoryContractRepository,
): ContractRepoInternals {
  return repository as unknown as ContractRepoInternals
}

function snapshotWalletRepository(
  repository: InMemoryWalletRepository,
): SerializedInMemoryWalletRepositoryV1 {
  const internal = getWalletInternals(repository)
  return {
    version: internal.version,
    walletState: serializeUnknown(internal.walletState),
    vtxosByAddress: serializeUnknown(internal.vtxosByAddress),
    utxosByAddress: serializeUnknown(internal.utxosByAddress),
    txsByAddress: serializeUnknown(internal.txsByAddress),
  }
}

function snapshotContractRepository(
  repository: InMemoryContractRepository,
): SerializedInMemoryContractRepositoryV1 {
  const internal = getContractInternals(repository)
  return {
    version: internal.version,
    contractData: serializeUnknown(internal.contractData),
    collections: serializeUnknown(internal.collections),
    contractsByScript: serializeUnknown(internal.contractsByScript),
  }
}

function applyWalletSnapshot(
  repository: InMemoryWalletRepository,
  snapshot: SerializedInMemoryWalletRepositoryV1,
): void {
  const internal = getWalletInternals(repository)
  internal.version = snapshot.version
  internal.walletState = deserializeUnknown(snapshot.walletState)
  internal.vtxosByAddress = deserializeUnknown(snapshot.vtxosByAddress) as Map<
    unknown,
    unknown
  >
  internal.utxosByAddress = deserializeUnknown(snapshot.utxosByAddress) as Map<
    unknown,
    unknown
  >
  internal.txsByAddress = deserializeUnknown(snapshot.txsByAddress) as Map<
    unknown,
    unknown
  >
}

function applyContractSnapshot(
  repository: InMemoryContractRepository,
  snapshot: SerializedInMemoryContractRepositoryV1,
): void {
  const internal = getContractInternals(repository)
  internal.version = snapshot.version
  internal.contractData = deserializeUnknown(snapshot.contractData) as Map<
    unknown,
    unknown
  >
  internal.collections = deserializeUnknown(snapshot.collections) as Map<
    unknown,
    unknown
  >
  internal.contractsByScript = deserializeUnknown(snapshot.contractsByScript) as Map<
    unknown,
    unknown
  >
}

function wrapRepositoryWithPersistenceFlush<T extends object>(
  inner: T,
  mutatingMethods: Set<string>,
): T {
  return new Proxy(inner, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver)
      if (typeof property === 'string' && mutatingMethods.has(property) && typeof value === 'function') {
        return (...args: unknown[]) => {
          const result = (value as (...fnArgs: unknown[]) => unknown).apply(target, args)
          if (result instanceof Promise) {
            return result.then((resolved) => {
              scheduleSdkPersistenceFlush()
              return resolved
            })
          }
          scheduleSdkPersistenceFlush()
          return result
        }
      }
      return value
    },
  })
}

/**
 * Returns a proxy that shares storage with `inner` and calls `scheduleSdkPersistenceFlush`
 * after mutating SDK repo methods. Flush/export still use the inner instance (see
 * `create-persisting-arkade-storage.ts`).
 */
export function wrapWalletRepositoryForPersistence(
  inner: InMemoryWalletRepository,
): InMemoryWalletRepository {
  return wrapRepositoryWithPersistenceFlush(inner, WALLET_MUTATING_METHODS)
}

/** Contract-repo counterpart of {@link wrapWalletRepositoryForPersistence}. */
export function wrapContractRepositoryForPersistence(
  inner: InMemoryContractRepository,
): InMemoryContractRepository {
  return wrapRepositoryWithPersistenceFlush(inner, CONTRACT_MUTATING_METHODS)
}

export function exportBitboardArkadeSdkPersistence(params: {
  walletRepository: InMemoryWalletRepository
  contractRepository: InMemoryContractRepository
}): BitboardArkadeSdkPersistenceV1 {
  return {
    version: BITBOARD_ARKADE_SDK_PERSISTENCE_VERSION,
    wallet: snapshotWalletRepository(params.walletRepository),
    contract: snapshotContractRepository(params.contractRepository),
  }
}

export function importBitboardArkadeSdkPersistence(params: {
  walletRepository: InMemoryWalletRepository
  contractRepository: InMemoryContractRepository
  persistence: BitboardArkadeSdkPersistenceV1
}): void {
  if (params.persistence.version !== BITBOARD_ARKADE_SDK_PERSISTENCE_VERSION) {
    throw new Error(
      `Unsupported Arkade SDK persistence version: ${String(params.persistence.version)}`,
    )
  }
  applyWalletSnapshot(params.walletRepository, params.persistence.wallet)
  applyContractSnapshot(params.contractRepository, params.persistence.contract)
}

export function parseBitboardArkadeSdkPersistenceJson(
  sdkPersistenceJson: string,
): BitboardArkadeSdkPersistenceV1 {
  const parsed: unknown = JSON.parse(sdkPersistenceJson)
  if (!isRecord(parsed) || parsed.version !== BITBOARD_ARKADE_SDK_PERSISTENCE_VERSION) {
    throw new Error('Invalid Arkade SDK persistence JSON')
  }
  if (!isRecord(parsed.wallet) || !isRecord(parsed.contract)) {
    throw new Error('Invalid Arkade SDK persistence JSON structure')
  }
  return parsed as unknown as BitboardArkadeSdkPersistenceV1
}

export function stringifyBitboardArkadeSdkPersistence(
  persistence: BitboardArkadeSdkPersistenceV1,
): string {
  return JSON.stringify(persistence)
}
