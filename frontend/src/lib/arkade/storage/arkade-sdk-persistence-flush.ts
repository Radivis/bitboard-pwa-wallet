import type { InMemoryContractRepository, InMemoryWalletRepository } from '@arkade-os/sdk'
import {
  exportBitboardArkadeSdkPersistence,
  stringifyBitboardArkadeSdkPersistence,
} from '@/lib/arkade/storage/arkade-in-memory-repo-snapshot'
import type { ArkadeSupportedNetworkMode } from '@/lib/arkade/arkade-endpoints'

export interface ArkadeSdkPersistenceBridge {
  persistSdkPersistence(params: {
    walletId: number
    networkMode: ArkadeSupportedNetworkMode
    password: string
    sdkPersistenceJson: string
  }): Promise<void>
}

const SDK_PERSISTENCE_FLUSH_DEBOUNCE_MS = 400

let persistenceBridge: ArkadeSdkPersistenceBridge | null = null
/** Inner (non-proxy) repos from {@link createPersistingArkadeStorage}; see that module for why. */
let flushContext: {
  walletId: number
  networkMode: ArkadeSupportedNetworkMode
  password: string
  walletRepository: InMemoryWalletRepository
  contractRepository: InMemoryContractRepository
} | null = null
let debouncedFlushTimer: ReturnType<typeof setTimeout> | null = null
let inFlightFlush: Promise<void> | null = null

export function setArkadeSdkPersistenceBridge(
  bridge: ArkadeSdkPersistenceBridge | null,
): void {
  persistenceBridge = bridge
}

export function setArkadeSdkPersistenceFlushContext(
  context: typeof flushContext,
): void {
  flushContext = context
  if (context == null) {
    clearDebouncedSdkPersistenceFlush()
  }
}

export function clearDebouncedSdkPersistenceFlush(): void {
  if (debouncedFlushTimer != null) {
    clearTimeout(debouncedFlushTimer)
    debouncedFlushTimer = null
  }
}

export function scheduleSdkPersistenceFlush(): void {
  if (flushContext == null || persistenceBridge == null) return
  clearDebouncedSdkPersistenceFlush()
  debouncedFlushTimer = setTimeout(() => {
    debouncedFlushTimer = null
    void flushSdkPersistenceNow()
  }, SDK_PERSISTENCE_FLUSH_DEBOUNCE_MS)
}

export async function flushSdkPersistenceNow(): Promise<void> {
  if (flushContext == null || persistenceBridge == null) return
  clearDebouncedSdkPersistenceFlush()
  if (inFlightFlush != null) {
    await inFlightFlush
    return
  }

  const { walletId, networkMode, password, walletRepository, contractRepository } =
    flushContext
  const bridge = persistenceBridge

  inFlightFlush = (async () => {
    const envelope = exportBitboardArkadeSdkPersistence({
      walletRepository,
      contractRepository,
    })
    const sdkPersistenceJson = stringifyBitboardArkadeSdkPersistence(envelope)
    await bridge.persistSdkPersistence({
      walletId,
      networkMode,
      password,
      sdkPersistenceJson,
    })
  })()

  try {
    await inFlightFlush
  } finally {
    inFlightFlush = null
  }
}
