import { toast } from 'sonner'
import { destroyDatabase } from '@/db/database'
import { destroyLabDatabase } from '@/db/lab-database'
import {
  blockSqliteStoragePersistForTeardown,
  blockWalletAndLabDatabaseAccessForTeardown,
  resetSqliteStorageTeardownGuard,
} from '@/db/storage-adapter'
import { awaitInFlightWalletSecretsWrites } from '@/db/wallet-secrets-write-tracker'
import { LAB_SQLITE_OPFS_BASENAME, WALLET_SQLITE_OPFS_BASENAME } from '@/db/opfs/opfs-sqlite-database-names'
import { WALLET_MIGRATION_FAILURE_OPFS_FILENAME } from '@/db/migrations/wallet-migration-failure-report'
import { appQueryClient } from '@/lib/shared/app-query-client'
import { awaitLabOperationQueueDrained } from '@/lib/lab/lab-coordinator'
import { removeOpfsRootEntryIfExistsWithRetry } from '@/db/opfs/opfs-root-file'
import { RELOAD_AFTER_OPFS_WRITE_MS } from '@/db/opfs/opfs-sqlite-replace-and-reload'
import { abortArkadeSessionForFactoryReset } from '@/lib/arkade/arkade-session-service'
import { terminateCryptoWorker } from '@/workers/crypto-factory'
import { terminateLabWorker } from '@/workers/lab-factory'
import { resetSecretsChannel } from '@/workers/secrets-channel'

const WIPE_LOG_PREFIX = '[wipe-all-app-data]'

/** Yield so cancelled queries and worker threads can finish closing handles before sqlite3_close. */
const PRE_DESTROY_SETTLE_MS = 100

/** Yield after worker/database teardown so wa-sqlite can release OPFS handles. */
const POST_DESTROY_SETTLE_MS = 250

function waitMs(delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, delayMs)
  })
}

/** Logs and rethrows — use around each teardown step to see which one fails in the console. */
async function wipeAsyncStep<T>(stepLabel: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    console.error(`${WIPE_LOG_PREFIX} FAILED step="${stepLabel}"`, err)
    throw err
  }
}

function wipeSyncStep<T>(stepLabel: string, fn: () => T): T {
  try {
    return fn()
  } catch (err) {
    console.error(`${WIPE_LOG_PREFIX} FAILED step="${stepLabel}"`, err)
    throw err
  }
}

async function removeOpfsSqliteBundle(bundleLabel: string, opfsBasename: string): Promise<void> {
  const paths = [`${opfsBasename}-wal`, `${opfsBasename}-shm`, opfsBasename] as const
  for (const fileName of paths) {
    await wipeAsyncStep(`removeOpfsRootEntry (${bundleLabel} ${fileName})`, () =>
      removeOpfsRootEntryIfExistsWithRetry(fileName),
    )
  }
}

/**
 * Removes wallet and lab SQLite files from OPFS and reloads the app (factory reset).
 * Call only after destroying in-memory Kysely usage is safe (same pattern as backup replace).
 */
export async function wipeAllAppDataOpfsAndReload(): Promise<void> {
  let hardBlockApplied = false
  let walletDestroyed = false
  try {
    await runFactoryResetTeardown({
      onHardBlockApplied: () => {
        hardBlockApplied = true
      },
      onWalletDestroyed: () => {
        walletDestroyed = true
      },
    })
  } catch (err) {
    if (hardBlockApplied && !walletDestroyed) {
      resetSqliteStorageTeardownGuard()
    }
    throw err
  }
}

async function runFactoryResetTeardown(options: {
  onHardBlockApplied: () => void
  onWalletDestroyed: () => void
}): Promise<void> {
  // Stop Zustand persist first so re-renders cannot enqueue settings writes, but keep
  // getDatabase() available until workers are aborted (Arkade flush is skipped on wipe).
  wipeSyncStep('blockSqliteStoragePersistForTeardown', () => {
    blockSqliteStoragePersistForTeardown()
  })

  // Let durable writes and chained lab persists finish before closing SQLite (avoids
  // "unable to close due to unfinalized statements or unfinished backups" from wa-sqlite).
  await wipeAsyncStep('awaitInFlightWalletSecretsWrites', () => awaitInFlightWalletSecretsWrites())
  await wipeAsyncStep('awaitLabOperationQueueDrained', () => awaitLabOperationQueueDrained())
  await wipeAsyncStep('appQueryClient.cancelQueries', () => appQueryClient.cancelQueries())
  wipeSyncStep('appQueryClient.clear', () => {
    appQueryClient.clear()
  })
  try {
    await abortArkadeSessionForFactoryReset()
  } catch (err) {
    console.error(`${WIPE_LOG_PREFIX} abortArkadeSessionForFactoryReset failed (continuing)`, err)
  }
  wipeSyncStep('resetSecretsChannel', () => {
    resetSecretsChannel()
  })
  wipeSyncStep('terminateLabWorker', () => {
    terminateLabWorker()
  })
  wipeSyncStep('terminateCryptoWorker', () => {
    terminateCryptoWorker()
  })
  // Yield so cancelled queries and worker threads can finish closing handles before sqlite3_close.
  await wipeAsyncStep(`preDestroyDelay(${PRE_DESTROY_SETTLE_MS}ms)`, () =>
    waitMs(PRE_DESTROY_SETTLE_MS),
  )
  wipeSyncStep('blockWalletAndLabDatabaseAccessForTeardown', () => {
    blockWalletAndLabDatabaseAccessForTeardown()
  })
  options.onHardBlockApplied()
  await wipeAsyncStep('destroyDatabase (wallet Kysely)', () => destroyDatabase())
  options.onWalletDestroyed()
  await wipeAsyncStep('destroyLabDatabase (lab Kysely)', () => destroyLabDatabase())
  await wipeAsyncStep(`postDestroySettle(${POST_DESTROY_SETTLE_MS}ms)`, () =>
    waitMs(POST_DESTROY_SETTLE_MS),
  )
  await removeOpfsSqliteBundle('wallet', WALLET_SQLITE_OPFS_BASENAME)
  await removeOpfsSqliteBundle('lab', LAB_SQLITE_OPFS_BASENAME)
  await wipeAsyncStep(`removeOpfsRootEntry (migration report ${WALLET_MIGRATION_FAILURE_OPFS_FILENAME})`, () =>
    removeOpfsRootEntryIfExistsWithRetry(WALLET_MIGRATION_FAILURE_OPFS_FILENAME),
  )

  toast.success('All app data removed. Reloading…')
  window.setTimeout(() => {
    window.location.reload()
  }, RELOAD_AFTER_OPFS_WRITE_MS)
}
