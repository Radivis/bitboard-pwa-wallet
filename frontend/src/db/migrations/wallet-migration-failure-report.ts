/**
 * After wallet schema migrations exhaust retries, we persist a JSON diagnostic to OPFS
 * so support can inspect failures without asking the user to reproduce.
 */

export const WALLET_MIGRATION_FAILURE_OPFS_FILENAME = 'wallet-schema-migration-failure.json'

export type WalletMigrationFailureReportV1 = {
  schemaVersion: 1
  kind: 'wallet_migration_failure'
  recordedAt: string
  attempts: number
  userAgent: string
  buildMode: string
  isProductionBuild: boolean
  error: SerializedErrorNode
  /** Parsed from the migration error message when available */
  migrationNameFromMessage?: string
}

type SerializedErrorNode = {
  message: string
  stack?: string
  cause?: SerializedErrorNode | string
}

function serializeErrorChain(error: unknown): SerializedErrorNode {
  if (error instanceof Error) {
    const node: SerializedErrorNode = {
      message: error.message,
      stack: error.stack,
    }
    if (error.cause !== undefined) {
      node.cause =
        error.cause instanceof Error || typeof error.cause === 'object'
          ? serializeErrorChain(error.cause)
          : String(error.cause)
    }
    return node
  }
  return { message: String(error) }
}

/** Matches `Migration "20260417_foo" failed` from {@link runMigrationsToLatest}. */
const MIGRATION_NAME_IN_MESSAGE = /^Migration "([^"]+)" failed/

export function extractMigrationNameFromErrorMessage(message: string): string | undefined {
  const m = message.match(MIGRATION_NAME_IN_MESSAGE)
  return m?.[1]
}

export function buildWalletMigrationFailureReportV1(input: {
  attempts: number
  lastError: unknown
}): WalletMigrationFailureReportV1 {
  const message =
    input.lastError instanceof Error ? input.lastError.message : String(input.lastError)
  return {
    schemaVersion: 1,
    kind: 'wallet_migration_failure',
    recordedAt: new Date().toISOString(),
    attempts: input.attempts,
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    buildMode: import.meta.env.MODE,
    isProductionBuild: import.meta.env.PROD === true,
    error: serializeErrorChain(input.lastError),
    migrationNameFromMessage: extractMigrationNameFromErrorMessage(message),
  }
}

async function writeUtf8FileToOpfsRoot(fileName: string, contents: string): Promise<void> {
  if (typeof navigator === 'undefined' || !navigator.storage?.getDirectory) {
    throw new Error('OPFS (navigator.storage.getDirectory) is not available')
  }
  const root = await navigator.storage.getDirectory()
  const handle = await root.getFileHandle(fileName, { create: true })
  const writable = await handle.createWritable()
  try {
    await writable.write(contents)
  } finally {
    await writable.close()
  }
}

/**
 * Best-effort write; logs and swallows errors so migration failure still propagates to the app.
 */
export async function tryWriteWalletMigrationFailureReport(input: {
  attempts: number
  lastError: unknown
}): Promise<void> {
  try {
    const report = buildWalletMigrationFailureReportV1(input)
    const json = `${JSON.stringify(report, null, 2)}\n`
    await writeUtf8FileToOpfsRoot(WALLET_MIGRATION_FAILURE_OPFS_FILENAME, json)
  } catch (err) {
    console.error('[wallet-migration] Could not write OPFS failure report:', err)
  }
}
