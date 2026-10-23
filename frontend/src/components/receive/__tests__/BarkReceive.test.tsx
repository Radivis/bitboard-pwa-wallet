import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BarkReceive } from '@/components/receive/BarkReceive'
import { renderWithProviders } from '@/test-utils/test-providers'

const barkReceiveTestState = vi.hoisted(() => ({
  snapshot: {
    loadPhase: 'loaded' as 'loaded' | 'loading' | 'load-error',
    networkMode: 'signet' as const,
    errorMessage: null as string | null,
    receiveKeyIndex: 0 as number | null,
  },
  query: {
    data: 'tark1qqstable' as string | undefined,
    isLoading: false,
    isError: false,
    isFetching: false,
  },
  mutate: vi.fn(),
  isPending: false,
}))

vi.mock('@/hooks/useBarkLoadLifecycleSnapshot', () => ({
  useBarkLoadLifecycleSnapshot: () => barkReceiveTestState.snapshot,
}))

vi.mock('@/hooks/useBarkReceiveQueries', () => ({
  useBarkReceiveAddressQuery: () => barkReceiveTestState.query,
  useBarkRevealReceiveAddressMutation: () => ({
    mutate: barkReceiveTestState.mutate,
    isPending: barkReceiveTestState.isPending,
  }),
}))

vi.mock('@/components/infomode/InfomodeWrapper', () => ({
  InfomodeWrapper: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock('qrcode.react', () => ({
  QRCodeSVG: ({ value }: { value: string }) => (
    <svg data-testid="qr-code" data-value={value} />
  ),
}))

describe('BarkReceive', () => {
  beforeEach(() => {
    barkReceiveTestState.snapshot = {
      loadPhase: 'loaded',
      networkMode: 'signet',
      errorMessage: null,
      receiveKeyIndex: 0,
    }
    barkReceiveTestState.query = {
      data: 'tark1qqstable',
      isLoading: false,
      isError: false,
      isFetching: false,
    }
    barkReceiveTestState.mutate.mockReset()
    barkReceiveTestState.isPending = false
  })

  it('shows the peeked address and does not reveal on render or reopen', () => {
    const first = renderWithProviders(<BarkReceive />)
    expect(screen.getByTestId('bark-receive-address')).toHaveTextContent('tark1qqstable')
    expect(screen.getByTestId('qr-code')).toHaveAttribute('data-value', 'tark1qqstable')
    expect(barkReceiveTestState.mutate).not.toHaveBeenCalled()

    first.unmount()
    render(<BarkReceive />)
    expect(screen.getByTestId('bark-receive-address')).toHaveTextContent('tark1qqstable')
    expect(barkReceiveTestState.mutate).not.toHaveBeenCalled()
  })

  it('Generate new address calls reveal once', async () => {
    const user = userEvent.setup()
    renderWithProviders(<BarkReceive />)
    await user.click(screen.getByRole('button', { name: 'Generate New Address' }))
    expect(barkReceiveTestState.mutate).toHaveBeenCalledTimes(1)
  })

  it('disables generate when the session is loaded without a receive index', () => {
    barkReceiveTestState.snapshot = {
      loadPhase: 'loaded',
      networkMode: 'signet',
      errorMessage: null,
      receiveKeyIndex: null,
    }
    barkReceiveTestState.query = {
      data: undefined,
      isLoading: false,
      isError: false,
      isFetching: false,
    }
    renderWithProviders(<BarkReceive />)
    expect(screen.getByText('Could not load Bark address.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Generate New Address' })).toBeDisabled()
    expect(barkReceiveTestState.mutate).not.toHaveBeenCalled()
  })
})
