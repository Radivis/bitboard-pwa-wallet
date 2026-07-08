import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ArkadeSignerMigrationBanner } from '@/components/wallet/ArkadeSignerMigrationBanner'
import type { ArkadeSignerMigrationHint, ArkadeSignerMigrationResult } from '@/workers/arkade-api'
import type { NetworkMode } from '@/stores/walletStore'

const signerMigrationMutate = vi.fn()
const partialResultRef = vi.hoisted(() => ({
  data: null as ArkadeSignerMigrationResult | null,
}))
const signerMigrationMutationRef = vi.hoisted(() => ({
  isPending: false,
  error: null as Error | null,
}))

vi.mock('@/hooks/useArkadeQueries', () => ({
  useArkadeSignerMigrationMutation: () => ({
    mutate: signerMigrationMutate,
    isPending: signerMigrationMutationRef.isPending,
    error: signerMigrationMutationRef.error,
  }),
  useArkadeSignerMigrationPartialResultQuery: () => ({
    data: partialResultRef.data,
  }),
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
    partialResultRef.data = null
    signerMigrationMutationRef.isPending = false
    signerMigrationMutationRef.error = null
    walletStoreState.arkadeSignerMigrationHint = null
    walletStoreState.activeWalletId = 1
    walletStoreState.activeArkadeConnectionId = 'conn-1'
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

  it('shows partial status from query cache and migrate again action', () => {
    partialResultRef.data = completeMigrationResult({
      migrationComplete: false,
      remainingPreCutoffVtxoCount: 2,
      remainingPreCutoffSats: 40_000,
      vtxoLeg: {
        migratedCount: 1,
        migratedSats: 20_000,
        deferredCount: 2,
        deferredSats: 40_000,
        oversizedCount: 0,
        oversizedSats: 0,
      },
      boardingLeg: emptyLeg(),
    })
    renderBanner(migrationHint('migratable'))

    expect(screen.getByTestId('arkade-signer-migration-partial')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Migrate again' })).toBeInTheDocument()
  })

  it('keeps partial status visible after remount when query cache has data', () => {
    partialResultRef.data = completeMigrationResult({
      migrationComplete: false,
      remainingPreCutoffVtxoCount: 1,
      remainingPreCutoffSats: 25_000,
    })
    const hint = migrationHint('migratable')
    const { unmount } = renderBanner(hint)
    expect(screen.getByTestId('arkade-signer-migration-partial')).toBeInTheDocument()
    unmount()

    renderBanner(hint)
    expect(screen.getByTestId('arkade-signer-migration-partial')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Migrate again' })).toBeInTheDocument()
  })

  it('calls signer migration mutation when migrate is clicked', async () => {
    const user = userEvent.setup()
    renderBanner(migrationHint('migratable'))

    await user.click(screen.getByRole('button', { name: 'Migrate funds' }))

    expect(signerMigrationMutate).toHaveBeenCalledTimes(1)
  })

  it('shows parsed Ark client message when migration fails', () => {
    signerMigrationMutationRef.error = new Error(
      JSON.stringify({
        code: 'client',
        message:
          'Ark client error: failed to get VTXOs for addresses: request failed: request failed',
      }),
    )
    renderBanner(migrationHint('migratable'))

    expect(
      screen.getByText(
        'Ark client error: failed to get VTXOs for addresses: request failed',
      ),
    ).toBeInTheDocument()
    expect(
      screen.queryByText(
        '{"code":"client","message":"Ark client error: failed to get VTXOs for addresses: request failed: request failed"}',
      ),
    ).not.toBeInTheDocument()
  })
})

function completeMigrationResult(
  overrides: Partial<ArkadeSignerMigrationResult> = {},
): ArkadeSignerMigrationResult {
  return {
    vtxoLeg: overrides.vtxoLeg ?? emptyLeg(),
    boardingLeg: overrides.boardingLeg ?? emptyLeg(),
    passCount: overrides.passCount ?? 1,
    migrationComplete: overrides.migrationComplete ?? true,
    passCapReached: overrides.passCapReached ?? false,
    remainingPreCutoffVtxoCount: overrides.remainingPreCutoffVtxoCount ?? 0,
    remainingPreCutoffSats: overrides.remainingPreCutoffSats ?? 0,
    remainingPreCutoffBoardingCount: overrides.remainingPreCutoffBoardingCount ?? 0,
    settleTxids: overrides.settleTxids ?? ['abc123'],
  }
}

function emptyLeg(): ArkadeSignerMigrationResult['vtxoLeg'] {
  return {
    migratedCount: 0,
    migratedSats: 0,
    deferredCount: 0,
    deferredSats: 0,
    oversizedCount: 0,
    oversizedSats: 0,
  }
}

function migrationHint(
  deprecatedStatus: ArkadeSignerMigrationHint['deprecatedStatus'],
): ArkadeSignerMigrationHint {
  return {
    previousSignerPkHex: '02oldsigner',
    deprecatedStatus,
    cutoffUnix: 4_102_444_800,
  }
}
