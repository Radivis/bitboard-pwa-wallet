import { describe, it, expect, vi, beforeEach } from 'vitest'
import { BadLocalChainStateError } from '@/lib/shared/bad-local-chain-state-error'
import { WASM_CRYPTO_ERROR_CODE_ESPLORA_NETWORK_MISMATCH } from '@/lib/shared/wasm-crypto-error'
import {
  reportWalletSyncError,
  showInitialSyncFailureToast,
} from '../wallet-sync-error-toast'

const toastError = vi.fn()

vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => toastError(...args),
  },
}))

const ESPLORA_NETWORK_MISMATCH_MESSAGE =
  'The Esplora server for Signet is on Mutinynet (tip height 3547496). Check the Esplora URL for Signet in Settings.'

function esploraNetworkMismatchError(): Error {
  return new Error(
    JSON.stringify({
      code: WASM_CRYPTO_ERROR_CODE_ESPLORA_NETWORK_MISMATCH,
      message: ESPLORA_NETWORK_MISMATCH_MESSAGE,
    }),
  )
}

describe('reportWalletSyncError', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('shows title + description with sanitized detail for initial-sync', () => {
    reportWalletSyncError(
      'initial-sync',
      new Error('Esplora request failed: HTTP 502'),
    )

    expect(toastError).toHaveBeenCalledWith('Initial sync failed', {
      description:
        'Esplora request failed: HTTP 502 · You can sync later from the dashboard.',
    })
  })

  it('shows single-line toast when initial-sync has no message detail', () => {
    reportWalletSyncError('initial-sync', new Error(''))

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

  it('shows an Esplora network mismatch as its own error with the Settings hint', () => {
    for (const context of ['initial-sync', 'unlock-background-sync'] as const) {
      toastError.mockClear()
      reportWalletSyncError(context, esploraNetworkMismatchError())

      expect(toastError).toHaveBeenCalledWith('Wrong Esplora network', {
        description: ESPLORA_NETWORK_MISMATCH_MESSAGE,
      })
    }
  })

  it('shows repair hint for initial-sync when error indicates bad local chain', () => {
    reportWalletSyncError(
      'initial-sync',
      new Error('Blockchain error: HeaderHeightNotFound(1)'),
    )

    expect(toastError).toHaveBeenCalledWith('Initial sync failed', {
      description: expect.stringMatching(/Full rescan/),
    })
  })
})

describe('showInitialSyncFailureToast', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('shows error with Retry action', () => {
    const onRetry = vi.fn()
    showInitialSyncFailureToast(
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

  it('does not suggest Full rescan for an Esplora network mismatch', () => {
    showInitialSyncFailureToast(esploraNetworkMismatchError(), vi.fn())

    const [title, options] = toastError.mock.calls[0] as [string, { description: string }]
    expect(title).toBe('Wrong Esplora network')
    expect(options.description).toContain(ESPLORA_NETWORK_MISMATCH_MESSAGE)
    expect(options.description).not.toMatch(/Full rescan/)
  })

  it('shows Full rescan hint for bad local chain', () => {
    const onRetry = vi.fn()
    showInitialSyncFailureToast(
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
