import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PwaUpdateBanner } from '@/components/PwaUpdateBanner'

const pwaRegisterMocks = vi.hoisted(() => ({
  needRefresh: false,
  setNeedRefresh: vi.fn(),
  updateServiceWorker: vi.fn(async () => undefined),
  onNeedRefresh: undefined as (() => void) | undefined,
  onRegisteredSW: undefined as (() => void) | undefined,
}))

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: (options: {
    onNeedRefresh?: () => void
    onRegisteredSW?: () => void
  }) => {
    pwaRegisterMocks.onNeedRefresh = options.onNeedRefresh
    pwaRegisterMocks.onRegisteredSW = options.onRegisteredSW
    return {
      needRefresh: [pwaRegisterMocks.needRefresh, pwaRegisterMocks.setNeedRefresh],
      offlineReady: [false, vi.fn()],
      updateServiceWorker: pwaRegisterMocks.updateServiceWorker,
    }
  },
}))

vi.mock('@/lib/pwa/check-for-service-worker-update', () => ({
  checkForServiceWorkerUpdate: vi.fn(),
}))

describe('PwaUpdateBanner', () => {
  beforeEach(() => {
    pwaRegisterMocks.needRefresh = false
    pwaRegisterMocks.setNeedRefresh.mockReset()
    pwaRegisterMocks.updateServiceWorker.mockClear()
  })

  it('renders nothing when no update is waiting', () => {
    const { container } = render(<PwaUpdateBanner />)
    expect(container.textContent).toBe('')
  })

  it('shows refresh prompt when an update is waiting', () => {
    pwaRegisterMocks.needRefresh = true
    render(<PwaUpdateBanner />)
    expect(screen.getByRole('region', { name: 'App update available' })).toBeInTheDocument()
    expect(screen.getByText(/A new version is available/i)).toBeInTheDocument()
  })

  it('hides the prompt when the user chooses Later', async () => {
    pwaRegisterMocks.needRefresh = true
    const user = userEvent.setup()
    render(<PwaUpdateBanner />)
    await user.click(screen.getByRole('button', { name: 'Later' }))
    expect(screen.queryByRole('region', { name: 'App update available' })).not.toBeInTheDocument()
  })

  it('applies the update when the user chooses Refresh', async () => {
    pwaRegisterMocks.needRefresh = true
    const user = userEvent.setup()
    render(<PwaUpdateBanner />)
    await user.click(screen.getByRole('button', { name: 'Refresh to update' }))
    expect(pwaRegisterMocks.setNeedRefresh).toHaveBeenCalledWith(false)
    expect(pwaRegisterMocks.updateServiceWorker).toHaveBeenCalledWith(true)
  })

  it('shows the prompt again when onNeedRefresh fires after dismiss', async () => {
    pwaRegisterMocks.needRefresh = true
    const user = userEvent.setup()
    render(<PwaUpdateBanner />)
    await user.click(screen.getByRole('button', { name: 'Later' }))
    expect(screen.queryByRole('region', { name: 'App update available' })).not.toBeInTheDocument()

    act(() => {
      pwaRegisterMocks.onNeedRefresh?.()
    })
    expect(screen.getByRole('region', { name: 'App update available' })).toBeInTheDocument()
  })
})
