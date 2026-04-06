import { describe, it, expect } from 'vitest'
import { getLightningConnectionsForActiveWallet } from '@/lib/lightning-connection-utils'
import type { ConnectedLightningWallet } from '@/lib/lightning-backend-service'

function makeConn(
  partial: Partial<ConnectedLightningWallet> &
    Pick<ConnectedLightningWallet, 'id' | 'walletId' | 'networkMode'>,
): ConnectedLightningWallet {
  return {
    label: 'L',
    config: { type: 'nwc', connectionString: 'nostr+walletconnect://x' },
    createdAt: '',
    ...partial,
  }
}

describe('getLightningConnectionsForActiveWallet', () => {
  const wallets: ConnectedLightningWallet[] = [
    makeConn({
      id: 'a',
      walletId: 1,
      networkMode: 'signet',
    }),
    makeConn({
      id: 'b',
      walletId: 2,
      networkMode: 'signet',
    }),
  ]

  it('returns empty when Lightning is disabled', () => {
    expect(
      getLightningConnectionsForActiveWallet({
        connectedLightningWallets: wallets,
        activeWalletId: 1,
        networkMode: 'signet',
        isLightningEnabled: false,
      }),
    ).toEqual([])
  })

  it('returns empty when there is no active wallet', () => {
    expect(
      getLightningConnectionsForActiveWallet({
        connectedLightningWallets: wallets,
        activeWalletId: null,
        networkMode: 'signet',
        isLightningEnabled: true,
      }),
    ).toEqual([])
  })

  it('returns empty for networks without Lightning support', () => {
    expect(
      getLightningConnectionsForActiveWallet({
        connectedLightningWallets: wallets,
        activeWalletId: 1,
        networkMode: 'lab',
        isLightningEnabled: true,
      }),
    ).toEqual([])
  })

  it('returns only connections for the active wallet and network mode', () => {
    expect(
      getLightningConnectionsForActiveWallet({
        connectedLightningWallets: wallets,
        activeWalletId: 1,
        networkMode: 'signet',
        isLightningEnabled: true,
      }),
    ).toEqual([wallets[0]])
  })
})
