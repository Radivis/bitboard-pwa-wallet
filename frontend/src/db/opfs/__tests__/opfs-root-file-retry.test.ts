import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { removeOpfsRootEntryIfExistsWithRetry } from '@/db/opfs/opfs-root-file'

describe('removeOpfsRootEntryIfExistsWithRetry', () => {
  const removeEntry = vi.fn()

  beforeEach(() => {
    removeEntry.mockReset()
    vi.stubGlobal('navigator', {
      storage: {
        getDirectory: vi.fn().mockResolvedValue({ removeEntry }),
      },
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('retries when OPFS reports the entry is still locked', async () => {
    removeEntry
      .mockRejectedValueOnce(
        new DOMException('modifications are not allowed', 'NoModificationAllowedError'),
      )
      .mockResolvedValueOnce(undefined)

    await removeOpfsRootEntryIfExistsWithRetry('bitboard-wallet-wal', { maxAttempts: 3 })

    expect(removeEntry).toHaveBeenCalledTimes(2)
  })
})
