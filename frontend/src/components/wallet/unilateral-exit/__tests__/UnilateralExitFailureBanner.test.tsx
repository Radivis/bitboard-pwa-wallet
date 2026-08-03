import { describe, expect, it, vi, beforeEach, type ReactNode } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test-utils/test-providers'

vi.mock('@tanstack/react-router', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-router')>(
    '@tanstack/react-router',
  )
  return {
    ...actual,
    Link: ({
      children,
      to,
      ...props
    }: {
      children: ReactNode
      to: string
    }) => (
      <a href={to} {...props}>{children}</a>
    ),
  }
})
import { UnilateralExitFailureBanner } from '@/components/wallet/unilateral-exit/UnilateralExitFailureBanner'

const failureStoreMock = vi.hoisted(() => vi.fn())
const clearFailureMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/wallet/lifecycle/unilateral-exit-failure-persistence', async () => {
  const actual = await vi.importActual<
    typeof import('@/lib/wallet/lifecycle/unilateral-exit-failure-persistence')
  >('@/lib/wallet/lifecycle/unilateral-exit-failure-persistence')
  return {
    ...actual,
    clearPersistedUnilateralExitFailure: clearFailureMock,
    useUnilateralExitFailurePersistenceStore: (selector: (state: unknown) => unknown) =>
      selector({
        getFailure: failureStoreMock,
      }),
  }
})

vi.mock('@/stores/walletStore', async () => {
  const actual = await vi.importActual<typeof import('@/stores/walletStore')>(
    '@/stores/walletStore',
  )
  return {
    ...actual,
    useWalletStore: (selector: (state: unknown) => unknown) =>
      selector({
        activeWalletId: 1,
        activeArkadeConnectionId: 'conn-1',
        networkMode: 'regtest',
        loadedDescriptorWallet: null,
      }),
  }
})

describe('UnilateralExitFailureBanner', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    failureStoreMock.mockReturnValue(null)
  })

  it('renders failure banner for asp swept targets', () => {
    failureStoreMock.mockReturnValue({
      selectedLeafOutpoints: [{ txid: 'aa'.repeat(32), vout: 0 }],
      jobStartedAtUnix: 1_700_000_000,
      detectedAtUnix: 1_700_000_100,
      reasonCode: 'asp_swept_targets',
      detailMessage: 'Operator swept target VTXO.',
    })
    renderWithProviders(<UnilateralExitFailureBanner />)
    expect(screen.getByTestId('unilateral-exit-failure-banner')).toBeInTheDocument()
    expect(screen.getByText(/operator swept targets/i)).toBeInTheDocument()
  })

  it('dismiss clears persisted failure', async () => {
    const user = userEvent.setup()
    failureStoreMock.mockReturnValue({
      selectedLeafOutpoints: [{ txid: 'aa'.repeat(32), vout: 0 }],
      jobStartedAtUnix: 1_700_000_000,
      detectedAtUnix: 1_700_000_100,
      reasonCode: 'branch_funding_lost',
      detailMessage: 'Checkpoint confirmed on-chain.',
    })
    renderWithProviders(<UnilateralExitFailureBanner />)
    await user.click(screen.getByTestId('unilateral-exit-failure-dismiss'))
    expect(clearFailureMock).toHaveBeenCalledWith({
      walletId: 1,
      networkMode: 'regtest',
      connectionId: 'conn-1',
    })
  })
})
