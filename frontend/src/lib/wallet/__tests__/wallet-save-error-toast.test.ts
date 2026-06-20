import { describe, expect, it, vi } from 'vitest'
import { toast } from 'sonner'
import { OnchainSaveBlockingLockError } from '@/lib/wallet/lifecycle/onchain-save-lifecycle-orchestrator'
import { reportOnchainSaveBlockingLock } from '@/lib/wallet/wallet-save-error-toast'

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
  },
}))

describe('wallet-save-error-toast', () => {
  it('lock rejection shows toast starting with Latest wallet data could not be saved', () => {
    const reported = reportOnchainSaveBlockingLock(new OnchainSaveBlockingLockError())

    expect(reported).toBe(true)
    expect(toast.error).toHaveBeenCalledWith(
      "Latest wallet data couldn't be saved. Use Retry on the dashboard before locking.",
    )
  })
})
