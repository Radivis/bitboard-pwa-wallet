import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { toast } from 'sonner'
import { useWalletBackupExport } from '@/components/settings/use-wallet-backup-export'
import {
  ARGON2_KDF_PHC_WALLET_BACKUP_SIGN_PRODUCTION,
  WALLET_BACKUP_SIGNING_SALT_BYTES,
  WALLET_BACKUP_ZIP_FILENAME,
} from '@/lib/wallet/wallet-backup-constants'
import { WALLET_SQLITE_OPFS_BASENAME } from '@/db/opfs/opfs-sqlite-database-names'

const mockReadBlobFromOpfsRootIfExists = vi.hoisted(() => vi.fn())
const mockTriggerBrowserSaveLocalBlob = vi.hoisted(() => vi.fn())
const mockSignWalletBackupManifest = vi.hoisted(() => vi.fn())
const mockZipWalletBackupForLocalExport = vi.hoisted(() => vi.fn())
const mockLoadWalletSecrets = vi.hoisted(() => vi.fn())
const mockEnsureMigrated = vi.hoisted(() => vi.fn())
const mockGetDatabase = vi.hoisted(() => vi.fn())

const walletStoreState = vi.hoisted(() => ({ activeWalletId: 1 as number | null }))
const walletsState = vi.hoisted(() => ({
  data: [{ walletId: 1, name: 'Test', createdAt: new Date().toISOString() }] as
    | { walletId: number; name: string; createdAt: string }[]
    | undefined,
}))

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}))

vi.mock('@/stores/walletStore', () => ({
  useWalletStore: (selector: (s: typeof walletStoreState) => unknown) =>
    selector(walletStoreState),
}))

vi.mock('@/db', () => ({
  useWallets: () => ({ data: walletsState.data }),
  ensureMigrated: mockEnsureMigrated,
  getDatabase: mockGetDatabase,
  loadWalletSecrets: mockLoadWalletSecrets,
}))

vi.mock('@/db/wallet-persistence', () => ({
  loadWalletSecrets: mockLoadWalletSecrets,
}))

vi.mock('@/db/database', () => ({
  ensureMigrated: mockEnsureMigrated,
  getDatabase: mockGetDatabase,
}))

vi.mock('@/db/opfs/opfs-root-file', () => ({
  readBlobFromOpfsRootIfExists: mockReadBlobFromOpfsRootIfExists,
  triggerBrowserSaveLocalBlob: mockTriggerBrowserSaveLocalBlob,
}))

vi.mock('@/workers/encryption-factory', () => ({
  getEncryptionWorker: () => ({
    signWalletBackupManifest: mockSignWalletBackupManifest,
  }),
}))

vi.mock('@/lib/settings/zip-wallet-backup-export', () => ({
  zipWalletBackupForLocalExport: mockZipWalletBackupForLocalExport,
}))

vi.mock('@/lib/shared/argon2-ci-env', () => ({
  resolveArgon2CiParamsOrThrow: () => false,
}))

describe('useWalletBackupExport', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    walletStoreState.activeWalletId = 1
    walletsState.data = [
      { walletId: 1, name: 'Test', createdAt: new Date().toISOString() },
    ]
    mockEnsureMigrated.mockResolvedValue(undefined)
    mockGetDatabase.mockReturnValue({})
    mockLoadWalletSecrets.mockResolvedValue(undefined)
    mockSignWalletBackupManifest.mockResolvedValue('{"format_version":1}')
    mockZipWalletBackupForLocalExport.mockResolvedValue(new Blob(['zip']))
  })

  it('exportWallet opens password modal', () => {
    const { result } = renderHook(() => useWalletBackupExport())

    expect(result.current.exportPasswordOpen).toBe(false)

    act(() => {
      result.current.exportWallet()
    })

    expect(result.current.exportPasswordOpen).toBe(true)
  })

  it('checkSigningPasswordMatchesAppPassword returns skipped when no wallet', async () => {
    walletStoreState.activeWalletId = null
    walletsState.data = []
    const { result } = renderHook(() => useWalletBackupExport())

    let compareResult: Awaited<
      ReturnType<typeof result.current.checkSigningPasswordMatchesAppPassword>
    > | null = null
    await act(async () => {
      compareResult = await result.current.checkSigningPasswordMatchesAppPassword('pass')
    })

    expect(compareResult).toEqual({ match: false, skipped: true })
    expect(mockLoadWalletSecrets).not.toHaveBeenCalled()
  })

  it('checkSigningPasswordMatchesAppPassword returns match when secrets load', async () => {
    const { result } = renderHook(() => useWalletBackupExport())

    let compareResult: Awaited<
      ReturnType<typeof result.current.checkSigningPasswordMatchesAppPassword>
    > | null = null
    await act(async () => {
      compareResult = await result.current.checkSigningPasswordMatchesAppPassword('correct')
    })

    expect(compareResult).toEqual({ match: true, skipped: false })
    expect(mockEnsureMigrated).toHaveBeenCalled()
    expect(mockLoadWalletSecrets).toHaveBeenCalledWith({}, 'correct', 1)
  })

  it('checkSigningPasswordMatchesAppPassword returns mismatch on wrong password', async () => {
    mockLoadWalletSecrets.mockRejectedValue(new Error('Wrong password'))
    const { result } = renderHook(() => useWalletBackupExport())

    let compareResult: Awaited<
      ReturnType<typeof result.current.checkSigningPasswordMatchesAppPassword>
    > | null = null
    await act(async () => {
      compareResult = await result.current.checkSigningPasswordMatchesAppPassword('wrong')
    })

    expect(compareResult).toEqual({ match: false, skipped: false })
  })

  it('runSignedWalletExport shows error when OPFS blob missing', async () => {
    mockReadBlobFromOpfsRootIfExists.mockResolvedValue(null)
    const { result } = renderHook(() => useWalletBackupExport())

    await act(async () => {
      await result.current.runSignedWalletExport('password')
    })

    expect(mockReadBlobFromOpfsRootIfExists).toHaveBeenCalledWith(WALLET_SQLITE_OPFS_BASENAME)
    expect(toast.error).toHaveBeenCalledWith('Wallet data file was not found in local storage.')
    expect(mockTriggerBrowserSaveLocalBlob).not.toHaveBeenCalled()
    expect(result.current.walletExportBusy).toBe(false)
  })

  it('runSignedWalletExport saves ZIP and shows success toast', async () => {
    const sqliteBytes = new Uint8Array([1, 2, 3])
    const sqliteBlob = new Blob([sqliteBytes])
    mockReadBlobFromOpfsRootIfExists.mockResolvedValue(sqliteBlob)
    const zipBlob = new Blob(['zip-content'])
    mockZipWalletBackupForLocalExport.mockResolvedValue(zipBlob)
    const { result } = renderHook(() => useWalletBackupExport())

    act(() => {
      result.current.setExportPasswordOpen(true)
    })

    await act(async () => {
      await result.current.runSignedWalletExport('export-password')
    })

    expect(mockSignWalletBackupManifest).toHaveBeenCalledWith(
      sqliteBytes,
      'export-password',
      expect.any(Uint8Array),
      ARGON2_KDF_PHC_WALLET_BACKUP_SIGN_PRODUCTION,
    )
    const signingSalt = mockSignWalletBackupManifest.mock.calls[0]?.[2] as Uint8Array
    expect(signingSalt.byteLength).toBe(WALLET_BACKUP_SIGNING_SALT_BYTES)
    expect(mockZipWalletBackupForLocalExport).toHaveBeenCalledWith(
      sqliteBlob,
      '{"format_version":1}',
    )
    expect(mockTriggerBrowserSaveLocalBlob).toHaveBeenCalledWith(
      zipBlob,
      WALLET_BACKUP_ZIP_FILENAME,
    )
    expect(toast.success).toHaveBeenCalledWith(
      'Signed wallet backup exported as a ZIP on this device.',
    )
    await waitFor(() => {
      expect(result.current.exportPasswordOpen).toBe(false)
    })
    expect(result.current.walletExportBusy).toBe(false)
  })
})
