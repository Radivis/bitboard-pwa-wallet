import { describe, expect, it } from 'vitest'
import { migrateFeaturePersistedState } from '@/stores/featureStore'

describe('migrateFeaturePersistedState', () => {
  it('defaults isBarkEnabled off when migrating to version 5', () => {
    const migrated = migrateFeaturePersistedState(
      {
        isLightningEnabled: true,
        isMainnetAccessEnabled: false,
        isRegtestModeEnabled: false,
        isSegwitAddressesEnabled: false,
        isUtxoSelectionEnabled: false,
        isArkadeEnabled: true,
        isPeriodicSyncEnabled: true,
      },
      4,
    )

    expect(migrated).toEqual(
      expect.objectContaining({
        isBarkEnabled: false,
        isArkadeEnabled: true,
        isPeriodicSyncEnabled: true,
      }),
    )
  })
})
