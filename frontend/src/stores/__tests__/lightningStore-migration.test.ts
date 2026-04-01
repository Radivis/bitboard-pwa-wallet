import { describe, it, expect } from 'vitest'
import {
  migrateActiveConnectionIdsForRehydrate,
  migrateConnectedWalletsForRehydrate,
} from '@/stores/lightningStore'

describe('migrateConnectedWalletsForRehydrate', () => {
  it('adds mainnet when networkMode is missing', () => {
    const out = migrateConnectedWalletsForRehydrate([
      {
        id: 'a',
        walletId: 1,
        label: 'Old',
        config: { type: 'nwc' as const, connectionString: 'nostr+walletconnect://x' },
        createdAt: '2024-01-01',
      },
    ])
    expect(out[0].networkMode).toBe('mainnet')
  })

  it('preserves existing networkMode', () => {
    const out = migrateConnectedWalletsForRehydrate([
      {
        id: 'a',
        walletId: 1,
        label: 'X',
        networkMode: 'signet',
        config: { type: 'nwc' as const, connectionString: 'nostr+walletconnect://x' },
        createdAt: '2024-01-01',
      },
    ])
    expect(out[0].networkMode).toBe('signet')
  })
})

describe('migrateActiveConnectionIdsForRehydrate', () => {
  it('migrates legacy Record walletId to connectionId to per-network map', () => {
    const out = migrateActiveConnectionIdsForRehydrate({
      1: 'conn-uuid',
      2: 'other-uuid',
    })
    expect(out).toEqual({
      1: { mainnet: 'conn-uuid' },
      2: { mainnet: 'other-uuid' },
    })
  })

  it('passes through already-nested maps', () => {
    const nested = {
      1: { mainnet: 'a', signet: 'b' },
    }
    expect(migrateActiveConnectionIdsForRehydrate(nested)).toEqual(nested)
  })
})
