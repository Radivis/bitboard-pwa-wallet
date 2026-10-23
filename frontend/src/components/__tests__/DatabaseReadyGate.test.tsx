import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test-utils/test-providers'
import { DatabaseReadyGate } from '@/components/DatabaseReadyGate'
import { useSecureStorageAvailabilityStore } from '@/stores/secureStorageAvailabilityStore'

const MIGRATION_FAILURE_REPORT_TEXT = vi.hoisted(
  () => '{"migrationNameFromMessage":"signet-network-split"}',
)

const mockNavigate = vi.fn()
vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  useNavigate: () => mockNavigate,
}))

const getInitialDatabaseHealth = vi.hoisted(() => vi.fn())
vi.mock('@/db', () => ({
  getInitialDatabaseHealth: () => getInitialDatabaseHealth(),
  getDatabase: vi.fn(),
  syncNearZeroSecurityActiveFlagFromDb: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/db/opfs/opfs-root-file', () => ({
  readTextFileFromOpfsRootIfExists: vi.fn().mockResolvedValue(MIGRATION_FAILURE_REPORT_TEXT),
}))

vi.mock('@/db/opfs/opfs-capability', () => ({
  assessOpfsLikelyUnsupported: vi.fn().mockResolvedValue(false),
}))

function renderGateWithFailedDataMigration() {
  getInitialDatabaseHealth.mockResolvedValue({
    ok: false,
    error: new Error('Migration "signet-network-split" failed'),
  })
  return renderWithProviders(
    <DatabaseReadyGate>
      <p>App content</p>
    </DatabaseReadyGate>,
  )
}

describe('DatabaseReadyGate', () => {
  beforeEach(() => {
    mockNavigate.mockReset()
  })

  it('DatabaseReadyGate shows the migration failure report when the health check fails', async () => {
    renderGateWithFailedDataMigration()

    expect(await screen.findByText('Wallet upgrade failed')).toBeInTheDocument()
    expect(screen.getByText(MIGRATION_FAILURE_REPORT_TEXT)).toBeInTheDocument()
    expect(screen.getByText('App content')).toBeInTheDocument()
    expect(useSecureStorageAvailabilityStore.getState().isAvailable).toBe(false)
  })

  it('DatabaseReadyGate Go to Settings opens Data Backups', async () => {
    const user = userEvent.setup()
    renderGateWithFailedDataMigration()

    await user.click(await screen.findByRole('button', { name: 'Go to Settings' }))

    expect(mockNavigate).toHaveBeenCalledWith({
      to: '/settings/security',
      search: { section: 'data-backups' },
    })
  })
})
