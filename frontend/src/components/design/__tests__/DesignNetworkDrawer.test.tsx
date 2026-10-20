import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DesignNetworkDrawer, DESIGN_NETWORK_DRAWER_ID } from '@/components/design/DesignNetworkDrawer'
import {
  DRAWER_ENTER_FROM_TOP_CLASS,
  DRAWER_EXIT_TO_TOP_CLASS,
} from '@/components/design/use-drawer-presence'
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

  it('enters from the top and retracts upward', async () => {
    const user = userEvent.setup()
    function ClosingDrawer() {
      const [open, setOpen] = useState(true)
      return (
        <>
          <button type="button" onClick={() => setOpen(false)}>
            Close network
          </button>
          <DesignNetworkDrawer
            open={open}
            onOpen={() => setOpen(true)}
            onClose={() => setOpen(false)}
            onSelectNetwork={vi.fn()}
          />
        </>
      )
    }
    render(<ClosingDrawer />)

    const panel = screen.getByRole('dialog', { name: 'Network' })
    expect(panel).toHaveAttribute('data-motion', 'enter')
    expect(panel).toHaveClass(DRAWER_ENTER_FROM_TOP_CLASS)

    await user.click(screen.getByRole('button', { name: 'Close network' }))

    const exitingPanel = document.getElementById(DESIGN_NETWORK_DRAWER_ID)
    expect(exitingPanel).toHaveAttribute('data-motion', 'exit')
    expect(exitingPanel).toHaveClass(DRAWER_EXIT_TO_TOP_CLASS)
    expect(screen.queryByRole('dialog', { name: 'Network' })).not.toBeInTheDocument()

    await waitFor(() => {
      expect(document.getElementById(DESIGN_NETWORK_DRAWER_ID)).toBeNull()
    })
  })
})
