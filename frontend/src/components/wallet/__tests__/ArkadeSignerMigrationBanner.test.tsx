import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ArkadeSignerMigrationBanner } from '@/components/wallet/ArkadeSignerMigrationBanner'
import type { ArkadeSignerMigrationHint } from '@/workers/arkade-api'
import type { NetworkMode } from '@/stores/walletStore'

const orchestrateArkadeSyncThenSave = vi.fn()

vi.mock('@/lib/wallet/lifecycle/arkade-sync-lifecycle-orchestrator', () => ({
  orchestrateArkadeSyncThenSave: (...args: unknown[]) => orchestrateArkadeSyncThenSave(...args),
}))

const walletStoreState = vi.hoisted(() => ({
  arkadeSignerMigrationHint: null as ArkadeSignerMigrationHint | null,
  networkMode: 'signet' as NetworkMode,
  activeWalletId: 1 as number | null,
  activeArkadeConnectionId: 'conn-1' as string | null,
  setArkadeSignerMigrationHint: vi.fn(),
}))

vi.mock('@/stores/walletStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/stores/walletStore')>()
  return {
    ...actual,
    useWalletStore: Object.assign(
      (selector: (state: typeof walletStoreState) => unknown) => selector(walletStoreState),
      { getState: () => walletStoreState },
    ),
  }
})

function renderBanner(hint: ArkadeSignerMigrationHint | null) {
  walletStoreState.arkadeSignerMigrationHint = hint
  return render(<ArkadeSignerMigrationBanner />)
}

describe('ArkadeSignerMigrationBanner', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    walletStoreState.arkadeSignerMigrationHint = null
    walletStoreState.activeWalletId = 1
    walletStoreState.activeArkadeConnectionId = 'conn-1'
    orchestrateArkadeSyncThenSave.mockResolvedValue(undefined)
  })

  it('renders nothing when migration hint is absent', () => {
    const { container } = renderBanner(null)
    expect(container.textContent).toBe('')
  })

  it('shows migrate action for migratable hint', () => {
    renderBanner(migrationHint('migratable'))
    expect(screen.getByTestId('arkade-signer-migration-banner')).toBeInTheDocument()
    expect(screen.getByText('Arkade operator signer rotation')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Migrate funds' })).toBeInTheDocument()
  })

  it('shows urgent migrate action for due_now hint', () => {
    renderBanner(migrationHint('due_now'))
    expect(screen.getByText('Migrate Arkade funds now')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Migrate funds now' })).toBeInTheDocument()
  })

  it('hides migrate action for expired hint', () => {
    renderBanner(migrationHint('expired'))
    expect(screen.getByText('Operator signer rotation cutoff passed')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Migrate funds/ })).not.toBeInTheDocument()
  })

  it('runs signer migration sync and clears hint on success', async () => {
    const user = userEvent.setup()
    renderBanner(migrationHint('migratable'))

    await user.click(screen.getByRole('button', { name: 'Migrate funds' }))

    expect(orchestrateArkadeSyncThenSave).toHaveBeenCalledWith({
      walletId: 1,
      networkMode: 'signet',
      connectionId: 'conn-1',
      syncKind: 'signerMigration',
      awaitCompletion: true,
      throwOnError: true,
    })
    expect(walletStoreState.setArkadeSignerMigrationHint).toHaveBeenCalledWith(null)
  })
})

function migrationHint(
  deprecatedStatus: ArkadeSignerMigrationHint['deprecatedStatus'],
): ArkadeSignerMigrationHint {
  return {
    previousSignerPkHex: '02oldsigner',
    deprecatedStatus,
    cutoffUnix: 4_102_444_800,
  }
}
