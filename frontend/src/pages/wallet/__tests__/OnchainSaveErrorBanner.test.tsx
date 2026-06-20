import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AddressType } from '@/stores/walletStore'

const orchestrateOnchainRetrySave = vi.fn()
const acknowledgeOnchainSaveErrorForForcedLock = vi.fn()

let saveSnapshot = {
  savePhase: 'save-error' as const,
  errorMessage: 'disk full',
  descriptorScope: {
    walletId: 1,
    networkMode: 'testnet' as const,
    addressType: AddressType.Taproot,
    accountId: 0,
  },
}

vi.mock('@/lib/wallet/lifecycle/onchain-save-lifecycle-orchestrator', () => ({
  getOnchainSaveLifecycleSnapshot: () => saveSnapshot,
  subscribeOnchainSaveLifecycle: (listener: (next: typeof saveSnapshot) => void) => {
    listener(saveSnapshot)
    return () => undefined
  },
  orchestrateOnchainRetrySave: (...args: unknown[]) => orchestrateOnchainRetrySave(...args),
  acknowledgeOnchainSaveErrorForForcedLock: (...args: unknown[]) =>
    acknowledgeOnchainSaveErrorForForcedLock(...args),
}))

vi.mock('@/stores/walletStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/stores/walletStore')>()
  return {
    ...actual,
    useWalletStore: (selector: (state: { networkMode: 'testnet' }) => unknown) =>
      selector({ networkMode: 'testnet' }),
  }
})

import { OnchainSaveErrorBanner } from '@/pages/wallet/OnchainSaveErrorBanner'

describe('OnchainSaveErrorBanner', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    saveSnapshot = {
      savePhase: 'save-error',
      errorMessage: 'disk full',
      descriptorScope: {
        walletId: 1,
        networkMode: 'testnet',
        addressType: AddressType.Taproot,
        accountId: 0,
      },
    }
    orchestrateOnchainRetrySave.mockResolvedValue(undefined)
  })

  it('Retry calls orchestrateOnchainRetrySave', async () => {
    const user = userEvent.setup()
    render(<OnchainSaveErrorBanner />)

    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(orchestrateOnchainRetrySave).toHaveBeenCalledTimes(1)
  })

  it('Lock anyway confirms then acknowledges forced lock', async () => {
    const user = userEvent.setup()
    render(<OnchainSaveErrorBanner />)

    await user.click(screen.getByRole('button', { name: 'Lock anyway' }))
    await user.click(await screen.findByRole('button', { name: 'Lock anyway' }))

    expect(acknowledgeOnchainSaveErrorForForcedLock).toHaveBeenCalledTimes(1)
  })
})
