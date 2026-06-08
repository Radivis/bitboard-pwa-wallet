import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  flushSdkPersistenceNow,
  setArkadeSdkPersistenceBridge,
  setArkadeSdkPersistenceExporter,
  setArkadeSdkPersistenceFlushContext,
} from '@/lib/arkade/storage/arkade-sdk-persistence-flush'

describe('flushSdkPersistenceNow', () => {
  beforeEach(() => {
    setArkadeSdkPersistenceExporter(async () => '{"version":3}')
    setArkadeSdkPersistenceBridge({
      persistSdkPersistence: vi.fn().mockResolvedValue(undefined),
    })
    setArkadeSdkPersistenceFlushContext({
      walletId: 1,
      networkMode: 'signet',
      connectionId: 'conn-1',
      password: 'pw',
    })
  })

  afterEach(() => {
    setArkadeSdkPersistenceExporter(null)
    setArkadeSdkPersistenceBridge(null)
    setArkadeSdkPersistenceFlushContext(null)
  })

  it('exports again after an in-flight flush so newer WASM state is not dropped', async () => {
    let exportCount = 0
    setArkadeSdkPersistenceExporter(async () => {
      exportCount += 1
      return `{"export":${exportCount}}`
    })

    const persistMock = vi.fn().mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20))
    })
    setArkadeSdkPersistenceBridge({ persistSdkPersistence: persistMock })

    const firstFlush = flushSdkPersistenceNow()
    const secondFlush = flushSdkPersistenceNow()

    await Promise.all([firstFlush, secondFlush])

    expect(await firstFlush).toBe(true)
    expect(await secondFlush).toBe(true)
    expect(exportCount).toBe(2)
    expect(persistMock).toHaveBeenCalledTimes(2)
    expect(persistMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        sdkPersistenceJson: '{"export":2}',
      }),
    )
  })
})
