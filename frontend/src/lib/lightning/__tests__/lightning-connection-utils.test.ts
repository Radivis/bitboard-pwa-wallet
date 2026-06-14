import { describe, it, expect } from 'vitest'
import {
  getLightningConnectionsForActiveWallet,
  reconcileActiveLightningConnectionIds,
  resolveActiveLightningConnection,
} from '@/lib/lightning/lightning-connection-utils'
import type { ConnectedLightningWallet } from '@/lib/lightning/lightning-backend-service'

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

describe('reconcileActiveLightningConnectionIds', () => {
  const mainnetConn = makeConn({
    id: 'mainnet-1',
    walletId: 1,
    networkMode: 'mainnet',
  })

  it('assigns the first connection when no active id exists for that network', () => {
    expect(
      reconcileActiveLightningConnectionIds({
        walletId: 1,
        connections: [mainnetConn],
        activeConnectionIds: {},
      }),
    ).toEqual({ 1: { mainnet: 'mainnet-1' } })
  })

  it('keeps a valid active id after hydration', () => {
    expect(
      reconcileActiveLightningConnectionIds({
        walletId: 1,
        connections: [mainnetConn],
        activeConnectionIds: { 1: { mainnet: 'mainnet-1' } },
      }),
    ).toEqual({ 1: { mainnet: 'mainnet-1' } })
  })

  it('replaces a stale active id with the loaded connection', () => {
    expect(
      reconcileActiveLightningConnectionIds({
        walletId: 1,
        connections: [mainnetConn],
        activeConnectionIds: { 1: { mainnet: 'old-id-from-sqlite' } },
      }),
    ).toEqual({ 1: { mainnet: 'mainnet-1' } })
  })
})

describe('resolveActiveLightningConnection', () => {
  const mainnetConn = makeConn({
    id: 'mainnet-1',
    walletId: 1,
    networkMode: 'mainnet',
  })

  it('returns the matching connection when active ids are missing', () => {
    expect(
      resolveActiveLightningConnection({
        connectedWallets: [mainnetConn],
        activeConnectionIds: {},
        walletId: 1,
        networkMode: 'mainnet',
      }),
    ).toBe(mainnetConn)
  })

  it('returns null when no connection exists for the network', () => {
    expect(
      resolveActiveLightningConnection({
        connectedWallets: [mainnetConn],
        activeConnectionIds: {},
        walletId: 1,
        networkMode: 'signet',
      }),
    ).toBeNull()
  })
})
