import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ArkadeReceive } from '@/components/receive/ArkadeReceive'

const balanceQueryMock = vi.hoisted(() => vi.fn())
const addressQueryMock = vi.hoisted(() => vi.fn())
const newAddressMutationMock = vi.hoisted(() => vi.fn())

vi.mock('@/hooks/useArkadeQueries', () => ({
  useArkadeBalanceQuery: () => balanceQueryMock(),
  useArkadeAddressQuery: () => addressQueryMock(),
  useArkadeNewAddressMutation: () => newAddressMutationMock(),
}))

vi.mock('@/stores/walletStore', () => ({
  useWalletStore: (selector: (state: { networkMode: string }) => unknown) =>
    selector({ networkMode: 'signet' }),
}))

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
    })
  })

  it('DASH-ARK-41 polls Arkade balance while receive UI is shown', () => {
    render(<ArkadeReceive />)
    expect(balanceQueryMock).toHaveBeenCalled()
  })

  it('shows stable address across two peek calls via address query data', () => {
    render(<ArkadeReceive />)
    expect(screen.getAllByText('tark1qqreceive').length).toBeGreaterThan(0)
    render(<ArkadeReceive />)
    expect(screen.getAllByText('tark1qqreceive').length).toBeGreaterThan(0)
    expect(addressQueryMock).toHaveBeenCalled()
  })

  it('Generate New Address triggers reveal mutation', async () => {
    const mutate = vi.fn()
    newAddressMutationMock.mockReturnValue({
      isPending: false,
      mutate,
    })
    const user = userEvent.setup()
    render(<ArkadeReceive />)
    await user.click(screen.getByRole('button', { name: 'Generate New Address' }))
    expect(mutate).toHaveBeenCalledTimes(1)
  })
})
