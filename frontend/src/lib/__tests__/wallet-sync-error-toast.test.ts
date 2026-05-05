import { describe, it, expect, vi, beforeEach } from 'vitest'
import { BadLocalChainStateError } from '@/lib/bad-local-chain-state-error'
import {
  reportWalletSyncError,
  showImportInitialSyncFailureToast,
} from '../wallet-sync-error-toast'

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

  it('shows repair hint for bootstrap when error indicates bad local chain', () => {
    reportWalletSyncError(
      'bootstrap-load',
      new Error(
        'Blockchain error: HeaderHashNotFound(BlockHash(000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f))',
      ),
    )

    expect(toastError).toHaveBeenCalledWith('Sync failed', {
      description: expect.stringMatching(/Full rescan/),
    })
  })

  it('shows repair hint for initial-import when error indicates bad local chain', () => {
    reportWalletSyncError(
      'initial-import',
      new Error('Blockchain error: HeaderHeightNotFound(1)'),
    )

    expect(toastError).toHaveBeenCalledWith('Initial sync failed', {
      description: expect.stringMatching(/Full rescan/),
    })
  })
})

describe('showImportInitialSyncFailureToast', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('shows error with Retry action', () => {
    const onRetry = vi.fn()
    showImportInitialSyncFailureToast(
      new Error('HTTP 503'),
      onRetry,
    )
    expect(toastError).toHaveBeenCalledWith(
      'Initial sync failed',
      expect.objectContaining({
        description: expect.stringContaining('HTTP 503'),
        action: { label: 'Retry', onClick: expect.any(Function) },
      }),
    )
    const call = toastError.mock.calls[0][1] as { action: { onClick: () => void } }
    call.action.onClick()
    expect(onRetry).toHaveBeenCalled()
  })

  it('shows Full rescan hint for bad local chain', () => {
    const onRetry = vi.fn()
    showImportInitialSyncFailureToast(
      new BadLocalChainStateError(),
      onRetry,
    )
    expect(toastError).toHaveBeenCalledWith(
      'Initial sync failed',
      expect.objectContaining({
        description: expect.stringMatching(/Full rescan/),
        action: { label: 'Retry', onClick: expect.any(Function) },
      }),
    )
  })
})
