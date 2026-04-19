import { describe, it, expect, vi, beforeEach } from 'vitest'
import { reportWalletSyncError } from '../wallet-sync-error-toast'

const toastError = vi.fn()

vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => toastError(...args),
  },
}))

describe('reportWalletSyncError', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('shows title + description with sanitized detail for initial-import', () => {
    reportWalletSyncError(
      'initial-import',
      new Error('Esplora request failed: HTTP 502'),
    )

    expect(toastError).toHaveBeenCalledWith('Initial sync failed', {
      description:
        'Esplora request failed: HTTP 502 · You can sync later from the dashboard.',
    })
  })

  it('shows single-line toast when initial-import has no message detail', () => {
    reportWalletSyncError('initial-import', new Error(''))

    expect(toastError).toHaveBeenCalledWith(
      'Initial sync failed — you can sync later from the dashboard.',
    )
  })

  it('shows Sync failed with description for bootstrap-load', () => {
    reportWalletSyncError('bootstrap-load', new Error('Failed to fetch'))

    expect(toastError).toHaveBeenCalledWith('Sync failed', {
      description:
        'Failed to fetch · Wallet is unlocked but chain data may be stale until sync succeeds.',
    })
  })
})
