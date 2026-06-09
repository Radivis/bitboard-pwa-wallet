import type { ArkadeSupportedNetworkMode } from '@/lib/arkade/arkade-endpoints'

export interface ArkadeSdkPersistenceBridge {
  persistSdkPersistence(params: {
    walletId: number
    networkMode: ArkadeSupportedNetworkMode
    connectionId: string
    password: string
    sdkPersistenceJson: string
    lastSuccessfulOperatorSyncAt?: string
  }): Promise<void>
}

const SDK_PERSISTENCE_FLUSH_DEBOUNCE_MS = 400

let persistenceBridge: ArkadeSdkPersistenceBridge | null = null
let flushContext: {
  walletId: number
  networkMode: ArkadeSupportedNetworkMode
  connectionId: string
  password: string
} | null = null
let debouncedFlushTimer: ReturnType<typeof setTimeout> | null = null
let inFlightFlush: Promise<void> | null = null
let exportSdkPersistenceJson: (() => Promise<string>) | null = null

/** Worker registers a queue-aware exporter so flush never races async WASM entry. */
export function setArkadeSdkPersistenceExporter(
  exporter: (() => Promise<string>) | null,
): void {
  exportSdkPersistenceJson = exporter
}

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
  if (flushContext == null || persistenceBridge == null || exportSdkPersistenceJson == null) {
    return
  }
  clearDebouncedSdkPersistenceFlush()
  debouncedFlushTimer = setTimeout(() => {
    debouncedFlushTimer = null
    void flushSdkPersistenceNow()
  }, SDK_PERSISTENCE_FLUSH_DEBOUNCE_MS)
}

async function readSdkPersistenceJson(): Promise<string> {
  if (exportSdkPersistenceJson == null) {
    throw new Error('Arkade SDK persistence exporter is not configured')
  }
  return exportSdkPersistenceJson()
}

export async function flushSdkPersistenceNow(): Promise<boolean> {
  if (flushContext == null || persistenceBridge == null || exportSdkPersistenceJson == null) {
    return false
  }
  clearDebouncedSdkPersistenceFlush()
  if (inFlightFlush != null) {
    await inFlightFlush
    // A concurrent flush may have exported stale state; export again with latest WASM.
    return flushSdkPersistenceNow()
  }

  const { walletId, networkMode, connectionId, password } = flushContext
  const bridge = persistenceBridge

  inFlightFlush = (async () => {
    const sdkPersistenceJson = await readSdkPersistenceJson()
    await bridge.persistSdkPersistence({
      walletId,
      networkMode,
      connectionId,
      password,
      sdkPersistenceJson,
    })
  })()

  try {
    await inFlightFlush
    return true
  } finally {
    inFlightFlush = null
  }
}

/** Critical paths (reveal, lock) must not silently skip persistence when flush is configured. */
export async function flushSdkPersistenceNowOrThrow(): Promise<void> {
  const flushed = await flushSdkPersistenceNow()
  if (!flushed) {
    throw new Error('Arkade SDK persistence flush was skipped (bridge or flush context missing)')
  }
}
