import { beforeEach, describe, expect, it, vi } from 'vitest'

const refreshArkadeStoreFromLoadedWasmMock = vi.hoisted(() => vi.fn())
const setActiveArkadeAccountIdMock = vi.hoisted(() => vi.fn())
const setLastOperatorSyncTimeMock = vi.hoisted(() => vi.fn())
const setArkadeSignerMigrationHintMock = vi.hoisted(() => vi.fn())
const getArkadeWorkerIfExistsMock = vi.hoisted(() => vi.fn())
const getArkadeWorkerMock = vi.hoisted(() => vi.fn())
const ensureArkadeAccountMock = vi.hoisted(() => vi.fn())
const resolveBumperHydrateMock = vi.hoisted(() => vi.fn())
const toastWarningMock = vi.hoisted(() => vi.fn())
const walletState = vi.hoisted(() => ({
  activeWalletId: 7 as number | null,
}))

const workerMocks = vi.hoisted(() => ({
  hasOpenSession: vi.fn(),
  reconcileActiveAccountId: vi.fn(),
  openSession: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: {
    warning: (...args: unknown[]) => toastWarningMock(...args),
  },
}))

vi.mock('@/stores/walletStore', () => ({
  useWalletStore: {
    getState: () => ({
      activeWalletId: walletState.activeWalletId,
      setActiveArkadeAccountId: setActiveArkadeAccountIdMock,
      setLastOperatorSyncTime: setLastOperatorSyncTimeMock,
      setArkadeSignerMigrationHint: setArkadeSignerMigrationHintMock,
    }),
  },
}))

vi.mock('@/lib/arkade/arkade-persistence-store-sync', () => ({
  refreshArkadeStoreFromLoadedWasm: (...args: unknown[]) =>
    refreshArkadeStoreFromLoadedWasmMock(...args),
}))

vi.mock('@/workers/arkade-factory', () => ({
  getArkadeWorkerIfExists: (...args: unknown[]) => getArkadeWorkerIfExistsMock(...args),
  getArkadeWorker: (...args: unknown[]) => getArkadeWorkerMock(...args),
}))

vi.mock('@/workers/secrets-channel', () => ({
  ensureArkadeWorkerSecretsChannel: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/arkade/arkade-accounts', () => ({
  ensureArkadeAccount: (...args: unknown[]) => ensureArkadeAccountMock(...args),
  resolveArkadeEndpointsForAccount: () => ({
    arkServerUrl: 'https://asp.example',
    delegatorUrl: '',
    esploraUrl: 'https://mutinynet.com/api',
  }),
}))

vi.mock('@/lib/arkade/arkade-endpoints', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/arkade/arkade-endpoints')>()
  return {
    ...actual,
    getArkadeEndpoints: () => ({
      arkServerUrl: 'https://asp.example',
      delegatorUrl: '',
      esploraUrl: 'https://mutinynet.com/api',
    }),
  }
})

vi.mock('@/lib/wallet/resolve-bumper-hydrate', () => ({
  resolveBumperHydrateForSessionOpen: (...args: unknown[]) =>
    resolveBumperHydrateMock(...args),
}))

import {
  hydrateArkadeDashboardAfterSessionOpen,
  openFreshArkadeWorkerSession,
  tryReuseExistingArkadeSession,
  type ArkadeSessionReuseState,
} from '@/lib/wallet/lifecycle/arkade-session-open-helpers'
import { BUMPER_HYDRATE_FALLBACK_WARNING } from '@/lib/wallet/bumper-hydrate-warning'

const TEST_ACCOUNT = {
  id: 'conn-helper-test',
  label: 'signet',
  networkMode: 'signet' as const,
  operatorUrl: 'https://asp.example',
  operatorSignerPkHex: '02deadbeef',
  createdAt: '2020-01-01T00:00:00.000Z',
}

function createSessionReuseState(initialKey: string | null = null): ArkadeSessionReuseState {
  let key = initialKey
  return {
    get lastOpenedSessionKey() {
      return key
    },
    setLastOpenedSessionKey(nextKey) {
      key = nextKey
    },
  }
}

describe('arkade-session-open-helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    walletState.activeWalletId = 7
    refreshArkadeStoreFromLoadedWasmMock.mockResolvedValue(undefined)
    workerMocks.hasOpenSession.mockResolvedValue(true)
    workerMocks.reconcileActiveAccountId.mockResolvedValue(undefined)
    getArkadeWorkerIfExistsMock.mockReturnValue(workerMocks)
    getArkadeWorkerMock.mockReturnValue(workerMocks)
    workerMocks.openSession.mockResolvedValue({
      arkadeAddress: 'tark1qtest',
      operatorSignerPkHex: '02deadbeef',
    })
    ensureArkadeAccountMock.mockResolvedValue(TEST_ACCOUNT)
    resolveBumperHydrateMock.mockResolvedValue({
      bumperChangesetJson: '{"local":{"hydrate":true}}',
      bumperFullScanDone: true,
    })
  })

  it('tryReuseExistingArkadeSession returns account id when session is already open', async () => {
    const sessionReuseState = createSessionReuseState('7:signet:conn-helper-test')

    const arkadeAccountId = await tryReuseExistingArkadeSession({
      walletId: 7,
      networkMode: 'signet',
      account: TEST_ACCOUNT,
      sessionReuseState,
    })

    expect(arkadeAccountId).toBe(TEST_ACCOUNT.id)
    expect(refreshArkadeStoreFromLoadedWasmMock).toHaveBeenCalledWith(TEST_ACCOUNT.id, 7)
    expect(setActiveArkadeAccountIdMock).toHaveBeenCalledWith(TEST_ACCOUNT.id)
  })

  it('tryReuseExistingArkadeSession returns null when session key does not match', async () => {
    const arkadeAccountId = await tryReuseExistingArkadeSession({
      walletId: 7,
      networkMode: 'signet',
      account: TEST_ACCOUNT,
      sessionReuseState: createSessionReuseState('other-key'),
    })

    expect(arkadeAccountId).toBeNull()
    expect(workerMocks.hasOpenSession).not.toHaveBeenCalled()
  })

  it('hydrateArkadeDashboardAfterSessionOpen updates store and schedules maintenance', async () => {
    const sessionReuseState = createSessionReuseState()
    const runPostOpenMaintenance = vi.fn().mockResolvedValue(undefined)

    await hydrateArkadeDashboardAfterSessionOpen({
      worker: workerMocks,
      walletId: 7,
      networkMode: 'signet',
      arkadeAccountId: TEST_ACCOUNT.id,
      signerMigrationHint: {
        previousSignerPkHex: '02deadbeef',
        deprecatedStatus: 'deprecated',
        cutoffUnix: 1_700_000_000,
      },
      bumperHydrateFellBackToEmpty: false,
      sessionReuseState,
      runPostOpenMaintenance,
    })

    expect(setArkadeSignerMigrationHintMock).toHaveBeenCalledWith({
      previousSignerPkHex: '02deadbeef',
      deprecatedStatus: 'deprecated',
      cutoffUnix: 1_700_000_000,
    })
    expect(workerMocks.reconcileActiveAccountId).toHaveBeenCalledWith(TEST_ACCOUNT.id)
    expect(setActiveArkadeAccountIdMock).toHaveBeenCalledWith(TEST_ACCOUNT.id)
    expect(sessionReuseState.lastOpenedSessionKey).toBe('7:signet:conn-helper-test')
    expect(runPostOpenMaintenance).toHaveBeenCalledWith(workerMocks, 'signet')
    expect(toastWarningMock).not.toHaveBeenCalled()
  })

  it('warns when bumper hydrate fell back to an empty wallet', async () => {
    await hydrateArkadeDashboardAfterSessionOpen({
      worker: workerMocks,
      walletId: 7,
      networkMode: 'signet',
      arkadeAccountId: TEST_ACCOUNT.id,
      signerMigrationHint: null,
      bumperHydrateFellBackToEmpty: true,
      sessionReuseState: createSessionReuseState(),
      runPostOpenMaintenance: vi.fn().mockResolvedValue(undefined),
    })

    expect(toastWarningMock).toHaveBeenCalledWith(BUMPER_HYDRATE_FALLBACK_WARNING)
  })

  it('does not warn about bumper hydrate after the active wallet changed', async () => {
    walletState.activeWalletId = 8

    await hydrateArkadeDashboardAfterSessionOpen({
      worker: workerMocks,
      walletId: 7,
      networkMode: 'signet',
      arkadeAccountId: TEST_ACCOUNT.id,
      signerMigrationHint: null,
      bumperHydrateFellBackToEmpty: true,
      sessionReuseState: createSessionReuseState(),
      runPostOpenMaintenance: vi.fn().mockResolvedValue(undefined),
    })

    expect(toastWarningMock).not.toHaveBeenCalled()
  })

  it('does not write the signer migration hint when the active wallet changed', async () => {
    walletState.activeWalletId = 8

    await hydrateArkadeDashboardAfterSessionOpen({
      worker: workerMocks,
      walletId: 7,
      networkMode: 'signet',
      arkadeAccountId: TEST_ACCOUNT.id,
      signerMigrationHint: {
        previousSignerPkHex: '02deadbeef',
        deprecatedStatus: 'deprecated',
        cutoffUnix: 1_700_000_000,
      },
      bumperHydrateFellBackToEmpty: false,
      sessionReuseState: createSessionReuseState(),
      runPostOpenMaintenance: vi.fn().mockResolvedValue(undefined),
    })

    expect(setArkadeSignerMigrationHintMock).not.toHaveBeenCalled()
    expect(workerMocks.reconcileActiveAccountId).not.toHaveBeenCalled()
    expect(setActiveArkadeAccountIdMock).not.toHaveBeenCalled()
  })

  it('LIFE-ARK-BUMP-02 openFreshArkadeWorkerSession passes SegWit-0 changeset and fullScanDone', async () => {
    const encrypted = {
      mnemonic: { ciphertext: new Uint8Array(), iv: new Uint8Array(), salt: new Uint8Array(), kdfPhc: 'x' },
      payload: { ciphertext: new Uint8Array(), iv: new Uint8Array(), salt: new Uint8Array(), kdfPhc: 'x' },
    }

    await openFreshArkadeWorkerSession({
      walletId: 7,
      networkMode: 'signet',
      encrypted,
      account: TEST_ACCOUNT,
      hadPersistedAccount: true,
    })

    expect(resolveBumperHydrateMock).toHaveBeenCalledWith({
      walletId: 7,
      networkMode: 'signet',
    })
    expect(workerMocks.openSession).toHaveBeenCalledWith(
      expect.objectContaining({
        bumperChangesetJson: '{"local":{"hydrate":true}}',
        bumperFullScanDone: true,
      }),
    )
  })
})
