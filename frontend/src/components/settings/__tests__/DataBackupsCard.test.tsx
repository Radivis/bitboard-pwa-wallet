import { describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test-utils/test-providers'
import { DataBackupsCard } from '@/components/settings/DataBackupsCard'
import { WALLET_MIGRATION_FAILURE_OPFS_FILENAME } from '@/db/migrations/wallet-migration-failure-report'

const MIGRATION_FAILURE_REPORT_TEXT = '{"migrationNameFromMessage":"signet-network-split"}'

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

vi.mock('@/db/database', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/db/database')>()),
  ensureSchemaAndDataMigrated: vi
    .fn()
    .mockRejectedValue(new Error('Migration "signet-network-split" failed')),
  getDatabase: vi.fn(() => {
    throw new Error('database unavailable')
  }),
}))

const readTextFileFromOpfsRootIfExists = vi.hoisted(() => vi.fn())
const triggerBrowserSaveLocalBlob = vi.hoisted(() => vi.fn())
vi.mock('@/db/opfs/opfs-root-file', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/db/opfs/opfs-root-file')>()),
  opfsRootFileExists: vi.fn(
    async (fileName: string) => fileName === WALLET_MIGRATION_FAILURE_OPFS_FILENAME,
  ),
  readTextFileFromOpfsRootIfExists: (...args: unknown[]) =>
    readTextFileFromOpfsRootIfExists(...args),
  triggerBrowserSaveLocalBlob: (...args: unknown[]) => triggerBrowserSaveLocalBlob(...args),
}))

describe('DataBackupsCard', () => {
  it('DataBackupsCard exports the migration error report while the database guard fails', async () => {
    readTextFileFromOpfsRootIfExists.mockResolvedValue(MIGRATION_FAILURE_REPORT_TEXT)
    const user = userEvent.setup()
    renderWithProviders(<DataBackupsCard />)

    await user.click(
      await screen.findByRole('button', { name: /Export migration error report/ }),
    )

    await waitFor(() => expect(triggerBrowserSaveLocalBlob).toHaveBeenCalledTimes(1))
    expect(readTextFileFromOpfsRootIfExists).toHaveBeenCalledWith(
      WALLET_MIGRATION_FAILURE_OPFS_FILENAME,
    )
    const [, zipFileName] = triggerBrowserSaveLocalBlob.mock.calls[0] as [Blob, string]
    expect(zipFileName).toBe('wallet-schema-migration-failure.zip')
  })
})
