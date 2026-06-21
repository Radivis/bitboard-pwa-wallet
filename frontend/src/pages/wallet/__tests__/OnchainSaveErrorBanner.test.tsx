import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AddressType } from '@/stores/walletStore'

const orchestrateOnchainRetrySave = vi.fn()
const acknowledgeOnchainSaveErrorForForcedLock = vi.fn()

type SaveSnapshot = {
  savePhase: 'not-saving' | 'saving' | 'save-error' | 'not-configured'
  errorMessage: string | null
  descriptorScope: {
    walletId: number
    networkMode: 'testnet'
    addressType: typeof AddressType.Taproot
    accountId: number
  } | null
}

let saveSnapshot: SaveSnapshot = {
  savePhase: 'save-error',
  errorMessage: 'disk full',
  descriptorScope: {
    walletId: 1,
    networkMode: 'testnet',
    addressType: AddressType.Taproot,
    accountId: 0,
  },
}

const onchainSaveListeners = new Set<(next: SaveSnapshot) => void>()

function publishOnchainSaveSnapshot(next: SaveSnapshot): void {
  saveSnapshot = next
  for (const listener of onchainSaveListeners) {
    listener(next)
  }
}

vi.mock('@/lib/wallet/lifecycle/onchain-save-lifecycle-orchestrator', () => ({
  getOnchainSaveLifecycleSnapshot: () => saveSnapshot,
  subscribeOnchainSaveLifecycle: (listener: (next: SaveSnapshot) => void) => {
    onchainSaveListeners.add(listener)
    listener(saveSnapshot)
    return () => {
      onchainSaveListeners.delete(listener)
    }
  },
  orchestrateOnchainRetrySave: (...args: unknown[]) => orchestrateOnchainRetrySave(...args),
  acknowledgeOnchainSaveErrorForForcedLock: (...args: unknown[]) =>
    acknowledgeOnchainSaveErrorForForcedLock(...args),
}))

vi.mock('@/lib/wallet/lifecycle/arkade-save-lifecycle-orchestrator', () => ({
  getArkadeSaveLifecycleSnapshot: () => ({
    savePhase: 'not-saving',
    errorMessage: null,
    railScope: null,
  }),
  subscribeArkadeSaveLifecycle: () => () => undefined,
  orchestrateArkadeRetrySave: vi.fn(),
  acknowledgeArkadeSaveErrorForForcedLock: vi.fn(),
}))

const orchestrateLightningRetrySave = vi.fn()
const acknowledgeLightningSaveErrorForForcedLock = vi.fn()

vi.mock('@/lib/wallet/lifecycle/lightning-save-lifecycle-orchestrator', () => ({
  getLightningSaveLifecycleSnapshot: () => ({
    savePhase: 'not-saving',
    errorMessage: null,
    railScope: null,
  }),
  subscribeLightningSaveLifecycle: () => () => undefined,
  orchestrateLightningRetrySave: (...args: unknown[]) => orchestrateLightningRetrySave(...args),
  acknowledgeLightningSaveErrorForForcedLock: (...args: unknown[]) =>
    acknowledgeLightningSaveErrorForForcedLock(...args),
}))

vi.mock('@/stores/featureStore', () => ({
  useFeatureStore: (selector: (state: { isLightningEnabled: boolean }) => unknown) =>
    selector({ isLightningEnabled: false }),
}))

vi.mock('@/lib/arkade/arkade-utils', () => ({
  isArkadeActiveForNetworkMode: () => false,
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
    onchainSaveListeners.clear()
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

  it('does not show during normal post-sync saving without a prior save-error', () => {
    saveSnapshot = {
      savePhase: 'saving',
      errorMessage: null,
      descriptorScope: {
        walletId: 1,
        networkMode: 'testnet',
        addressType: AddressType.Taproot,
        accountId: 0,
      },
    }

    render(<OnchainSaveErrorBanner />)

    expect(screen.queryByTestId('wallet-save-error-banner-onchain')).not.toBeInTheDocument()
  })

  it('stays visible with Saving label while retrying after save-error', () => {
    render(<OnchainSaveErrorBanner />)

    act(() => {
      publishOnchainSaveSnapshot({
        ...saveSnapshot,
        savePhase: 'saving',
        errorMessage: null,
      })
    })

    expect(screen.getByTestId('wallet-save-error-banner-onchain')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Saving...' })).toBeDisabled()

    act(() => {
      publishOnchainSaveSnapshot({
        ...saveSnapshot,
        savePhase: 'not-saving',
        errorMessage: null,
      })
    })

    expect(screen.queryByTestId('wallet-save-error-banner-onchain')).not.toBeInTheDocument()
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
