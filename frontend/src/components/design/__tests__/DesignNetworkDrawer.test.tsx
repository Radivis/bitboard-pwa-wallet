import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DesignNetworkDrawer } from '@/components/design/DesignNetworkDrawer'
import { useFeatureStore } from '@/stores/featureStore'
import { useNetworkConnectivityStore } from '@/stores/networkConnectivityStore'
import { useWalletStore } from '@/stores/walletStore'

vi.mock('@/db/storage-adapter', () => ({
  sqliteStorage: {
    getItem: async () => null,
    setItem: async () => undefined,
    removeItem: async () => undefined,
  },
}))

describe('DesignNetworkDrawer', () => {
  beforeEach(() => {
    useWalletStore.setState({ networkMode: 'testnet', loadedDescriptorWallet: null })
    useFeatureStore.setState({ isRegtestModeEnabled: false })
    useNetworkConnectivityStore.setState({
      lastOnlineNetwork: 'signet',
      lastOfflineNetwork: 'lab',
    })
  })

  it('marks the committed network and omits Mutinynet and disabled Regtest', () => {
    render(<DesignNetworkDrawer open onOpen={vi.fn()} onClose={vi.fn()} onSelectNetwork={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Online' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Offline' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Testnet 4' })).toHaveAttribute('data-status', 'selected')
    expect(screen.getByRole('button', { name: 'Signet' })).toHaveAttribute('data-status', 'default')
    expect(screen.getByRole('button', { name: 'Lab' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Mutinynet' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Regtest' })).not.toBeInTheDocument()
  })

  it('asks for the remembered network when the switch flips', async () => {
    const user = userEvent.setup()
    const onSelectNetwork = vi.fn()
    useNetworkConnectivityStore.setState({ lastOfflineNetwork: 'regtest' })
    render(
      <DesignNetworkDrawer open onOpen={vi.fn()} onClose={vi.fn()} onSelectNetwork={onSelectNetwork} />,
    )

    await user.click(screen.getByRole('button', { name: 'Offline' }))
    expect(onSelectNetwork).toHaveBeenCalledWith('lab')

    useFeatureStore.setState({ isRegtestModeEnabled: true })
    await user.click(screen.getByRole('button', { name: 'Offline' }))
    expect(onSelectNetwork).toHaveBeenCalledWith('regtest')

    await user.click(screen.getByRole('button', { name: 'Lab' }))
    expect(onSelectNetwork).toHaveBeenCalledWith('lab')
  })
})
