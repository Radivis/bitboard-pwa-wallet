import { toast } from 'sonner'
import { destroyDatabase } from '@/db/database'
import { destroyLabDatabase } from '@/db/lab-database'
import { blockSqliteStorageForTeardown } from '@/db/storage-adapter'
import { awaitInFlightWalletSecretsWrites } from '@/db/wallet-secrets-write-tracker'
import { LAB_SQLITE_OPFS_BASENAME, WALLET_SQLITE_OPFS_BASENAME } from '@/db/opfs/opfs-sqlite-database-names'
import { WALLET_MIGRATION_FAILURE_OPFS_FILENAME } from '@/db/migrations/wallet-migration-failure-report'
import { appQueryClient } from '@/lib/shared/app-query-client'
import { awaitLabOperationQueueDrained } from '@/lib/lab/lab-coordinator'
import { removeOpfsRootEntryIfExistsWithRetry } from '@/db/opfs/opfs-root-file'
import { RELOAD_AFTER_OPFS_WRITE_MS } from '@/db/opfs/opfs-sqlite-replace-and-reload'
import { closeArkadeSession } from '@/lib/arkade/arkade-session-service'
import { terminateCryptoWorker } from '@/workers/crypto-factory'
import { terminateLabWorker } from '@/workers/lab-factory'
import { resetSecretsChannel } from '@/workers/secrets-channel'

const WIPE_LOG_PREFIX = '[wipe-all-app-data]'

/** Yield after worker/database teardown so wa-sqlite can release OPFS handles. */
const POST_DESTROY_SETTLE_MS = 250

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
  // First: stop Zustand persist and all Kysely access so re-renders cannot reopen OPFS SQLite
  // while we tear down (clear() and modals still mounted can otherwise call getDatabase()).
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
  await wipeAsyncStep('closeArkadeSession', () => closeArkadeSession())
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
  await wipeAsyncStep('preDestroyDelay(100ms)', () => {
    return new Promise<void>((resolve) => {
      window.setTimeout(resolve, 100)
    })
  })
  await wipeAsyncStep('destroyDatabase (wallet Kysely)', () => destroyDatabase())
  await wipeAsyncStep('destroyLabDatabase (lab Kysely)', () => destroyLabDatabase())
  await wipeAsyncStep(`postDestroySettle(${POST_DESTROY_SETTLE_MS}ms)`, () => {
    return new Promise<void>((resolve) => {
      window.setTimeout(resolve, POST_DESTROY_SETTLE_MS)
    })
  })
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
