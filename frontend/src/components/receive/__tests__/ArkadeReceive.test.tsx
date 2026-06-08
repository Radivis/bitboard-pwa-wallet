import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import { ArkadeReceive } from '@/components/receive/ArkadeReceive'

const balanceQueryMock = vi.hoisted(() => vi.fn())
const addressQueryMock = vi.hoisted(() => vi.fn())

vi.mock('@/hooks/useArkadeQueries', () => ({
  useArkadeBalanceQuery: () => balanceQueryMock(),
  useArkadeAddressQuery: () => addressQueryMock(),
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
  })

  it('DASH-ARK-41 polls Arkade balance while receive UI is shown', () => {
    render(<ArkadeReceive />)
    expect(balanceQueryMock).toHaveBeenCalled()
  })
})
