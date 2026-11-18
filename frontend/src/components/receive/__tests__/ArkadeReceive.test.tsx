import { describe, expect, it, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ArkadeReceive } from '@/components/receive/ArkadeReceive'
import { renderWithProviders } from '@/test-utils/test-providers'
import {
  ARKADE_HARD_GAP_OPT_IN_LABEL,
  type ArkadeOffchainReceiveGap,
} from '@/lib/arkade/arkade-receive-gap-surface'
import {
  HARD_GAP_GENERATE_LABEL,
  SOFT_GAP_CONFIRM_TITLE,
  SOFT_GAP_KEEP_LABEL,
} from '@/lib/wallet/receive-gap-surface'

const balanceQueryMock = vi.hoisted(() => vi.fn())
const addressQueryMock = vi.hoisted(() => vi.fn())
const newAddressMutationMock = vi.hoisted(() => vi.fn())
const gapQueryMock = vi.hoisted(() => vi.fn())
const readGapMock = vi.hoisted(() => vi.fn())

const unrevealedGap: ArkadeOffchainReceiveGap = {
  revealed: false,
  index: 0,
  receiveCount: 0,
  gap: 0,
  batchGap: 1,
  displayedBatchGap: 0,
  snapshotPresent: false,
}

vi.mock('@/hooks/useArkadeQueries', () => ({
  useArkadeBalanceQuery: () => balanceQueryMock(),
  useArkadeAddressQuery: () => addressQueryMock(),
  useArkadeNewAddressMutation: () => newAddressMutationMock(),
  useArkadeOffchainReceiveGapQuery: () => gapQueryMock(),
  readArkadeOffchainReceiveGap: () => readGapMock(),
}))

vi.mock('@/stores/walletStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/stores/walletStore')>()
  const state = {
    ...actual.useWalletStore.getState(),
    networkMode: 'mutinynet' as const,
    committedNetworkMode: 'mutinynet' as const,
  }
  return {
    ...actual,
    useWalletStore: Object.assign(
      (selector: (walletState: typeof state) => unknown) => selector(state),
      { getState: () => state },
    ),
  }
})

vi.mock('@/lib/arkade/arkade-utils', () => ({
  isArkadeActiveForNetworkMode: () => true,
}))

describe('ArkadeReceive', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    addressQueryMock.mockReturnValue({
      isLoading: false,
      isError: false,
      data: 'tark1qqreceive',
    })
    balanceQueryMock.mockReturnValue({
      isLoading: false,
      data: { confirmedSats: 0, totalSats: 0 },
    })
    newAddressMutationMock.mockReturnValue({
      isPending: false,
      mutate: vi.fn(),
      mutateAsync: vi.fn().mockResolvedValue('tark1next'),
    })
    gapQueryMock.mockReturnValue({ data: undefined })
    readGapMock.mockResolvedValue(unrevealedGap)
  })

  it('DASH-ARK-41 polls Arkade balance while receive UI is shown', () => {
    renderWithProviders(<ArkadeReceive />)
    expect(balanceQueryMock).toHaveBeenCalled()
  })

  it('shows stable address across two peek calls via address query data', () => {
    renderWithProviders(<ArkadeReceive />)
    expect(screen.getAllByText('tark1qqreceive').length).toBeGreaterThan(0)
    expect(
      screen.getAllByTestId('receive-qr-rail-icon')[0]?.querySelector('span')?.style.maskImage,
    ).toContain('arkade-mark.svg')
    renderWithProviders(<ArkadeReceive />)
    expect(screen.getAllByText('tark1qqreceive').length).toBeGreaterThan(0)
    expect(addressQueryMock).toHaveBeenCalled()
  })

  it('Generate New Address triggers reveal mutation', async () => {
    const mutateAsync = vi.fn().mockResolvedValue('tark1next')
    newAddressMutationMock.mockReturnValue({
      isPending: false,
      mutate: mutateAsync,
      mutateAsync,
    })
    const user = userEvent.setup()
    renderWithProviders(<ArkadeReceive />)
    await user.click(screen.getByRole('button', { name: 'Generate New Address' }))
    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledTimes(1)
    })
  })

  it('asks before generating when the index gap is at least 1 and skips the reveal on cancel', async () => {
    const mutateAsync = vi.fn()
    newAddressMutationMock.mockReturnValue({
      isPending: false,
      mutate: mutateAsync,
      mutateAsync,
    })
    readGapMock.mockResolvedValue({
      ...unrevealedGap,
      revealed: true,
      gap: 1,
      batchGap: 1,
      snapshotPresent: true,
    })
    gapQueryMock.mockReturnValue({
      data: {
        ...unrevealedGap,
        revealed: true,
        gap: 1,
        batchGap: 1,
        snapshotPresent: true,
      },
    })
    const user = userEvent.setup()
    renderWithProviders(<ArkadeReceive />)
    await user.click(screen.getByRole('button', { name: 'Generate New Address' }))
    expect(await screen.findByRole('heading', { name: SOFT_GAP_CONFIRM_TITLE })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: SOFT_GAP_KEEP_LABEL }))
    expect(mutateAsync).not.toHaveBeenCalled()
  })

  it('keeps the hard opt-in disabled until it is checked', async () => {
    const mutateAsync = vi.fn().mockResolvedValue('tark1next')
    newAddressMutationMock.mockReturnValue({
      isPending: false,
      mutate: mutateAsync,
      mutateAsync,
    })
    readGapMock.mockResolvedValue({
      ...unrevealedGap,
      revealed: true,
      gap: 20,
      batchGap: 2,
      snapshotPresent: false,
    })
    const user = userEvent.setup()
    renderWithProviders(<ArkadeReceive />)
    await user.click(screen.getByRole('button', { name: 'Generate New Address' }))
    const confirm = await screen.findByRole('button', { name: HARD_GAP_GENERATE_LABEL })
    expect(confirm).toBeDisabled()
    await user.click(screen.getByRole('checkbox', { name: ARKADE_HARD_GAP_OPT_IN_LABEL }))
    expect(confirm).toBeEnabled()
    await user.click(confirm)
    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledTimes(1)
    })
  })

  it('shows the payment count and gap line from a snapshot', async () => {
    gapQueryMock.mockReturnValue({
      data: {
        ...unrevealedGap,
        revealed: true,
        receiveCount: 1,
        gap: 2,
        batchGap: 1,
        snapshotPresent: true,
      },
    })
    renderWithProviders(<ArkadeReceive />)
    expect(await screen.findByTestId('arkade-receive-payment-count')).toHaveTextContent(
      'Payments to this address: 1',
    )
    expect(screen.getByTestId('arkade-receive-unused-gap')).toHaveTextContent('Unused gap: 2')
    expect(screen.getByTestId('arkade-receive-unused-gap').textContent).not.toContain('looks ahead')
  })

  it('keeps a restore warning on an address a seed restore will not ask about', async () => {
    gapQueryMock.mockReturnValue({
      data: {
        ...unrevealedGap,
        revealed: true,
        receiveCount: 1,
        gap: 0,
        batchGap: 2,
        displayedBatchGap: 2,
        snapshotPresent: true,
      },
    })
    renderWithProviders(<ArkadeReceive />)
    expect(await screen.findByTestId('arkade-receive-restore-warning')).toHaveTextContent(
      'will not ask about this address',
    )
  })

  it('asks before generating when the key was used without an incoming payment', async () => {
    const mutateAsync = vi.fn()
    newAddressMutationMock.mockReturnValue({
      isPending: false,
      mutate: mutateAsync,
      mutateAsync,
    })
    readGapMock.mockResolvedValue({
      ...unrevealedGap,
      revealed: true,
      receiveCount: 0,
      gap: 0,
      batchGap: 1,
      displayedBatchGap: 0,
      snapshotPresent: true,
    })
    const user = userEvent.setup()
    renderWithProviders(<ArkadeReceive />)
    await user.click(screen.getByRole('button', { name: 'Generate New Address' }))
    expect(await screen.findByText(/has not received a payment/)).toBeInTheDocument()
    expect(mutateAsync).not.toHaveBeenCalled()
  })
})
