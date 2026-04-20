import { toast } from 'sonner'
import { destroyDatabase } from '@/db/database'
import { destroyLabDatabase } from '@/db/lab-database'
import { blockSqliteStorageForTeardown } from '@/db/storage-adapter'
import { awaitInFlightWalletSecretsWrites } from '@/db/wallet-secrets-write-tracker'
import { LAB_SQLITE_OPFS_BASENAME, WALLET_SQLITE_OPFS_BASENAME } from '@/db/opfs-sqlite-database-names'
import { WALLET_MIGRATION_FAILURE_OPFS_FILENAME } from '@/db/migrations/wallet-migration-failure-report'
import { appQueryClient } from '@/lib/app-query-client'
import { awaitLabOperationQueueDrained } from '@/lib/lab-coordinator'
import { removeOpfsRootEntryIfExists } from '@/lib/opfs-root-file'
import { RELOAD_AFTER_OPFS_WRITE_MS } from '@/lib/opfs-sqlite-replace-and-reload'
import { terminateCryptoWorker } from '@/workers/crypto-factory'
import { terminateLabWorker } from '@/workers/lab-factory'

const WIPE_LOG_PREFIX = '[wipe-all-app-data]'

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
      removeOpfsRootEntryIfExists(fileName),
    )
  }
}

/**
 * Removes wallet and lab SQLite files from OPFS and reloads the app (factory reset).
 * Call only after destroying in-memory Kysely usage is safe (same pattern as backup replace).
 */
export async function wipeAllAppDataOpfsAndReload(): Promise<void> {
  // First: stop Zustand persist from opening new SQLite statements while we tear down (clear()
  // and re-renders can otherwise trigger setItem concurrently with destroy()).
  wipeSyncStep('blockSqliteStorageForTeardown', () => {
    blockSqliteStorageForTeardown()
  })

  // Let durable writes and chained lab persists finish before closing SQLite (avoids
  // "unable to close due to unfinalized statements or unfinished backups" from wa-sqlite).
  await wipeAsyncStep('awaitInFlightWalletSecretsWrites', () => awaitInFlightWalletSecretsWrites())
  await wipeAsyncStep('awaitLabOperationQueueDrained', () => awaitLabOperationQueueDrained())
  await wipeAsyncStep('appQueryClient.cancelQueries', () => appQueryClient.cancelQueries())
  wipeSyncStep('appQueryClient.clear', () => {
    appQueryClient.clear()
  })
  wipeSyncStep('terminateLabWorker', () => {
    terminateLabWorker()
  })
  wipeSyncStep('terminateCryptoWorker', () => {
    terminateCryptoWorker()
  })
  // Yield so cancelled queries and worker threads can finish closing handles before sqlite3_close.
  await wipeAsyncStep('preDestroyDelay(100ms)', () => {
    return new Promise<void>((resolve) => {
      window.setTimeout(resolve, 100)
    })
  })
  await wipeAsyncStep('destroyDatabase (wallet Kysely)', () => destroyDatabase())
  await wipeAsyncStep('destroyLabDatabase (lab Kysely)', () => destroyLabDatabase())
  await removeOpfsSqliteBundle('wallet', WALLET_SQLITE_OPFS_BASENAME)
  await removeOpfsSqliteBundle('lab', LAB_SQLITE_OPFS_BASENAME)
  await wipeAsyncStep(`removeOpfsRootEntry (migration report ${WALLET_MIGRATION_FAILURE_OPFS_FILENAME})`, () =>
    removeOpfsRootEntryIfExists(WALLET_MIGRATION_FAILURE_OPFS_FILENAME),
  )

  toast.success('All app data removed. Reloading…')
  window.setTimeout(() => {
    window.location.reload()
  }, RELOAD_AFTER_OPFS_WRITE_MS)
}
