import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('lab-cross-tab-sync', () => {
  const postMessage = vi.fn()

  beforeEach(() => {
    postMessage.mockClear()
    vi.stubGlobal(
      'BroadcastChannel',
      class {
        postMessage = postMessage
        close = vi.fn()
      },
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it('notifyLabStatePersistedAfterCommit posts to BroadcastChannel when available', async () => {
    const { notifyLabStatePersistedAfterCommit } = await import('@/lib/lab-cross-tab-sync')
    notifyLabStatePersistedAfterCommit()
    expect(postMessage).toHaveBeenCalledTimes(1)
    const payload = postMessage.mock.calls[0][0] as { sourceTabId?: string }
    expect(typeof payload?.sourceTabId).toBe('string')
  })
})
