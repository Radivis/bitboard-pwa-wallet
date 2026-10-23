import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  networkTargetForConnectivitySwitch,
  useNetworkConnectivityStore,
} from '@/stores/networkConnectivityStore'

vi.mock('@/db/storage-adapter', () => ({
  sqliteStorage: {
    getItem: async () => null,
    setItem: async () => undefined,
    removeItem: async () => undefined,
  },
}))

describe('network connectivity memory', () => {
  beforeEach(() => {
    useNetworkConnectivityStore.setState({
      lastOnlineNetwork: 'testnet',
      lastOfflineNetwork: 'lab',
    })
  })

  it('keeps online and offline memories separate', () => {
    useNetworkConnectivityStore.getState().rememberNetwork('signet')

    expect(useNetworkConnectivityStore.getState().lastOnlineNetwork).toBe('signet')
    expect(useNetworkConnectivityStore.getState().lastOfflineNetwork).toBe('lab')

    useNetworkConnectivityStore.getState().rememberNetwork('mutinynet')

    expect(useNetworkConnectivityStore.getState().lastOnlineNetwork).toBe('mutinynet')
    expect(useNetworkConnectivityStore.getState().lastOfflineNetwork).toBe('lab')

    useNetworkConnectivityStore.getState().rememberNetwork('regtest')

    expect(useNetworkConnectivityStore.getState().lastOfflineNetwork).toBe('regtest')
    expect(useNetworkConnectivityStore.getState().lastOnlineNetwork).toBe('mutinynet')
  })

  it('asks for the other side and skips disabled regtest', () => {
    expect(
      networkTargetForConnectivitySwitch({
        current: 'testnet',
        lastOnlineNetwork: 'signet',
        lastOfflineNetwork: 'regtest',
        regtestEnabled: false,
      }),
    ).toBe('lab')
    expect(
      networkTargetForConnectivitySwitch({
        current: 'lab',
        lastOnlineNetwork: 'signet',
        lastOfflineNetwork: 'regtest',
        regtestEnabled: true,
      }),
    ).toBe('signet')
    expect(
      networkTargetForConnectivitySwitch({
        current: 'mainnet',
        lastOnlineNetwork: 'signet',
        lastOfflineNetwork: 'regtest',
        regtestEnabled: true,
      }),
    ).toBe('regtest')
  })
})
