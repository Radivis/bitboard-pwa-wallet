import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PERIODIC_SYNC_INTERVAL_SECONDS,
} from '@/lib/wallet/periodic-sync/periodic-sync-constants'
import { resolvePeriodicSyncRefetchIntervalMs } from '@/lib/wallet/periodic-sync/resolve-periodic-sync-refetch-interval'
import type { PeriodicSyncRailState } from '@/stores/periodicSyncStore'

function defaultRails(): PeriodicSyncRailState {
  return {
    onchain: { isEnabled: true, intervalSeconds: DEFAULT_PERIODIC_SYNC_INTERVAL_SECONDS },
    lightning: { isEnabled: true, intervalSeconds: DEFAULT_PERIODIC_SYNC_INTERVAL_SECONDS },
    arkade: { isEnabled: true, intervalSeconds: DEFAULT_PERIODIC_SYNC_INTERVAL_SECONDS },
    bark: { isEnabled: true, intervalSeconds: DEFAULT_PERIODIC_SYNC_INTERVAL_SECONDS },
  }
}

describe('resolvePeriodicSyncRefetchIntervalMs', () => {
  it('returns false when the master periodic sync feature is off', () => {
    expect(
      resolvePeriodicSyncRefetchIntervalMs({
        rail: 'onchain',
        isPeriodicSyncEnabled: false,
        isLightningEnabled: true,
        isArkadeEnabled: true,
        isBarkEnabled: false,
        networkMode: 'signet',
        rails: defaultRails(),
        documentVisibilityState: 'visible',
      }),
    ).toBe(false)
  })

  it('returns false when per-rail periodic sync is disabled', () => {
    const rails = defaultRails()
    rails.lightning.isEnabled = false

    expect(
      resolvePeriodicSyncRefetchIntervalMs({
        rail: 'lightning',
        isPeriodicSyncEnabled: true,
        isLightningEnabled: true,
        isArkadeEnabled: false,
        isBarkEnabled: false,
        networkMode: 'signet',
        rails,
        documentVisibilityState: 'visible',
      }),
    ).toBe(false)
  })

  it('returns false for on-chain on lab network', () => {
    expect(
      resolvePeriodicSyncRefetchIntervalMs({
        rail: 'onchain',
        isPeriodicSyncEnabled: true,
        isLightningEnabled: false,
        isArkadeEnabled: false,
        isBarkEnabled: false,
        networkMode: 'lab',
        rails: defaultRails(),
        documentVisibilityState: 'visible',
      }),
    ).toBe(false)
  })

  it('returns false when the document is hidden', () => {
    expect(
      resolvePeriodicSyncRefetchIntervalMs({
        rail: 'arkade',
        isPeriodicSyncEnabled: true,
        isLightningEnabled: false,
        isArkadeEnabled: true,
        isBarkEnabled: false,
        networkMode: 'signet',
        rails: defaultRails(),
        documentVisibilityState: 'hidden',
      }),
    ).toBe(false)
  })

  it('returns interval in milliseconds when periodic sync is active', () => {
    const rails = defaultRails()
    rails.onchain.intervalSeconds = 120

    expect(
      resolvePeriodicSyncRefetchIntervalMs({
        rail: 'onchain',
        isPeriodicSyncEnabled: true,
        isLightningEnabled: false,
        isArkadeEnabled: false,
        isBarkEnabled: false,
        networkMode: 'signet',
        rails,
        documentVisibilityState: 'visible',
      }),
    ).toBe(120_000)
  })

  it('returns false for lightning when the Lightning feature is off', () => {
    expect(
      resolvePeriodicSyncRefetchIntervalMs({
        rail: 'lightning',
        isPeriodicSyncEnabled: true,
        isLightningEnabled: false,
        isArkadeEnabled: false,
        isBarkEnabled: false,
        networkMode: 'signet',
        rails: defaultRails(),
        documentVisibilityState: 'visible',
      }),
    ).toBe(false)
  })

  it('returns false for Bark when the feature is off or the network is not signet', () => {
    expect(
      resolvePeriodicSyncRefetchIntervalMs({
        rail: 'bark',
        isPeriodicSyncEnabled: true,
        isLightningEnabled: false,
        isArkadeEnabled: false,
        isBarkEnabled: false,
        networkMode: 'signet',
        rails: defaultRails(),
        documentVisibilityState: 'visible',
      }),
    ).toBe(false)

    expect(
      resolvePeriodicSyncRefetchIntervalMs({
        rail: 'bark',
        isPeriodicSyncEnabled: true,
        isLightningEnabled: false,
        isArkadeEnabled: false,
        isBarkEnabled: true,
        networkMode: 'testnet',
        rails: defaultRails(),
        documentVisibilityState: 'visible',
      }),
    ).toBe(false)
  })

  it('returns the Bark interval when the feature is on, the network is signet, and the tab is visible', () => {
    const rails = defaultRails()
    rails.bark.intervalSeconds = 90

    expect(
      resolvePeriodicSyncRefetchIntervalMs({
        rail: 'bark',
        isPeriodicSyncEnabled: true,
        isLightningEnabled: false,
        isArkadeEnabled: false,
        isBarkEnabled: true,
        networkMode: 'signet',
        rails,
        documentVisibilityState: 'visible',
      }),
    ).toBe(90_000)
  })
})
