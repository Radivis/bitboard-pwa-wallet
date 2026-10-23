import { describe, expect, it } from 'vitest'
import { DEFAULT_PERIODIC_SYNC_INTERVAL_SECONDS } from '@/lib/wallet/periodic-sync/periodic-sync-constants'
import { migratePeriodicSyncPersistedState } from '@/stores/periodicSyncStore'

describe('migratePeriodicSyncPersistedState', () => {
  it('adds a default Bark rail when older settings have none', () => {
    const migrated = migratePeriodicSyncPersistedState({
      rails: {
        onchain: { isEnabled: false, intervalSeconds: 60 },
        lightning: { isEnabled: true, intervalSeconds: DEFAULT_PERIODIC_SYNC_INTERVAL_SECONDS },
        arkade: { isEnabled: true, intervalSeconds: DEFAULT_PERIODIC_SYNC_INTERVAL_SECONDS },
      },
    })

    expect(migrated.rails.bark).toEqual({
      isEnabled: true,
      intervalSeconds: DEFAULT_PERIODIC_SYNC_INTERVAL_SECONDS,
    })
    expect(migrated.rails.onchain).toEqual({ isEnabled: false, intervalSeconds: 60 })
  })
})
