import type { ArkadeSupportedNetworkMode } from '@/lib/arkade/arkade-endpoints'
import { loadBitboardArkWasm } from '@/lib/arkade/load-bitboard-ark-wasm'

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
let flushContext: {
  walletId: number
  networkMode: ArkadeSupportedNetworkMode
  password: string
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

async function exportSdkPersistenceJsonFromWasm(): Promise<string> {
  const wasm = await loadBitboardArkWasm()
  return wasm.ark_export_persistence_json()
}

export async function flushSdkPersistenceNow(): Promise<void> {
  if (flushContext == null || persistenceBridge == null) return
  clearDebouncedSdkPersistenceFlush()
  if (inFlightFlush != null) {
    await inFlightFlush
    return
  }

  const { walletId, networkMode, password } = flushContext
  const bridge = persistenceBridge

  inFlightFlush = (async () => {
    const sdkPersistenceJson = await exportSdkPersistenceJsonFromWasm()
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
