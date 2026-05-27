import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { toast } from 'sonner'
import { useWalletBackupImport } from '@/components/settings/use-wallet-backup-import'

const mockParseWalletBackupZipFile = vi.hoisted(() => vi.fn())
const mockAnyWalletHasNoMnemonicBackupFlag = vi.hoisted(() => vi.fn())
const mockReplaceOpfsSqliteAfterDestroy = vi.hoisted(() => vi.fn())
const mockVerifyWalletBackupManifest = vi.hoisted(() => vi.fn())
const mockEnsureMigrated = vi.hoisted(() => vi.fn())
const mockGetDatabase = vi.hoisted(() => vi.fn())

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}))

vi.mock('@/lib/wallet/wallet-backup-import', () => ({
  parseWalletBackupZipFile: mockParseWalletBackupZipFile,
}))

vi.mock('@/db/wallet-no-mnemonic-backup', () => ({
  anyWalletHasNoMnemonicBackupFlag: mockAnyWalletHasNoMnemonicBackupFlag,
}))

vi.mock('@/db/opfs/opfs-sqlite-replace-and-reload', () => ({
  replaceOpfsSqliteAfterDestroy: mockReplaceOpfsSqliteAfterDestroy,
}))

vi.mock('@/workers/encryption-factory', () => ({
  getEncryptionWorker: () => ({
    verifyWalletBackupManifest: mockVerifyWalletBackupManifest,
  }),
}))

vi.mock('@/db/database', () => ({
  destroyDatabase: vi.fn(),
  ensureMigrated: mockEnsureMigrated,
  getDatabase: mockGetDatabase,
}))

vi.mock('@/db', () => ({
  ensureMigrated: mockEnsureMigrated,
  getDatabase: mockGetDatabase,
}))

function createZipChangeEvent(file: File): React.ChangeEvent<HTMLInputElement> {
  return {
    target: {
      files: [file],
      value: 'C:\\fakepath\\backup.zip',
    },
  } as unknown as React.ChangeEvent<HTMLInputElement>
}

function createNonZipChangeEvent(): React.ChangeEvent<HTMLInputElement> {
  const file = new File(['data'], 'backup.txt', { type: 'text/plain' })
  return {
    target: {
      files: [file],
      value: 'C:\\fakepath\\backup.txt',
    },
  } as unknown as React.ChangeEvent<HTMLInputElement>
}

describe('useWalletBackupImport', () => {
  const parsedBackup = {
    sqliteBytes: new Uint8Array([9, 8, 7]),
    manifestJson: '{"format_version":1}',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockEnsureMigrated.mockResolvedValue(undefined)
    mockGetDatabase.mockReturnValue({})
    mockAnyWalletHasNoMnemonicBackupFlag.mockResolvedValue(false)
    mockParseWalletBackupZipFile.mockResolvedValue(parsedBackup)
    mockVerifyWalletBackupManifest.mockResolvedValue(undefined)
    mockReplaceOpfsSqliteAfterDestroy.mockResolvedValue(undefined)
  })

  it('onImportFilePick rejects non-ZIP files', async () => {
    const { result } = renderHook(() => useWalletBackupImport())

    await act(async () => {
      await result.current.onImportFilePick(createNonZipChangeEvent())
    })

    expect(toast.error).toHaveBeenCalledWith('Please choose a ZIP file.')
    expect(mockParseWalletBackupZipFile).not.toHaveBeenCalled()
    expect(result.current.importWipeOpen).toBe(false)
  })

  it('onImportFilePick blocked when no-mnemonic-backup flag set', async () => {
    mockAnyWalletHasNoMnemonicBackupFlag.mockResolvedValue(true)
    const file = new File(['zip'], 'backup.zip', { type: 'application/zip' })
    const { result } = renderHook(() => useWalletBackupImport())

    await act(async () => {
      await result.current.onImportFilePick(createZipChangeEvent(file))
    })

    expect(toast.error).toHaveBeenCalledWith(
      'Import blocked: back up every wallet seed phrase in Wallet Management before importing wallet data.',
    )
    expect(result.current.importWipeOpen).toBe(false)
  })

  it('onImportFilePick opens wipe dialog after valid ZIP', async () => {
    const file = new File(['zip'], 'backup.zip', { type: 'application/zip' })
    const { result } = renderHook(() => useWalletBackupImport())

    await act(async () => {
      await result.current.onImportFilePick(createZipChangeEvent(file))
    })

    expect(mockParseWalletBackupZipFile).toHaveBeenCalledWith(file)
    expect(result.current.importWipeOpen).toBe(true)
  })

  it('runVerifiedImport calls replace helper on successful verify', async () => {
    const file = new File(['zip'], 'backup.zip', { type: 'application/zip' })
    const { result } = renderHook(() => useWalletBackupImport())

    await act(async () => {
      await result.current.onImportFilePick(createZipChangeEvent(file))
    })
    act(() => {
      result.current.confirmWipeImport()
    })

    await act(async () => {
      await result.current.runVerifiedImport('correct-password')
    })

    expect(mockVerifyWalletBackupManifest).toHaveBeenCalledWith(
      parsedBackup.sqliteBytes,
      'correct-password',
      parsedBackup.manifestJson,
    )
    expect(mockReplaceOpfsSqliteAfterDestroy).toHaveBeenCalled()
  })

  it('runVerifiedImport shows remaining attempts after verify failure', async () => {
    mockVerifyWalletBackupManifest.mockRejectedValue(new Error('bad password'))
    const file = new File(['zip'], 'backup.zip', { type: 'application/zip' })
    const { result } = renderHook(() => useWalletBackupImport())

    await act(async () => {
      await result.current.onImportFilePick(createZipChangeEvent(file))
    })
    act(() => {
      result.current.confirmWipeImport()
    })

    await act(async () => {
      await result.current.runVerifiedImport('wrong')
    })

    expect(result.current.importVerifyInlineMessage).toBe(
      'Verification failed. 2 attempt(s) remaining.',
    )
    expect(result.current.importBypassModalOpen).toBe(false)
    expect(result.current.importPasswordOpen).toBe(true)
  })

  it('runVerifiedImport opens bypass modal after third failure', async () => {
    mockVerifyWalletBackupManifest.mockRejectedValue(new Error('bad password'))
    const file = new File(['zip'], 'backup.zip', { type: 'application/zip' })
    const { result } = renderHook(() => useWalletBackupImport())

    await act(async () => {
      await result.current.onImportFilePick(createZipChangeEvent(file))
    })
    act(() => {
      result.current.confirmWipeImport()
    })

    for (let attempt = 0; attempt < 3; attempt++) {
      await act(async () => {
        await result.current.runVerifiedImport('wrong')
      })
    }

    expect(result.current.importBypassModalOpen).toBe(true)
    expect(result.current.importPasswordOpen).toBe(false)
  })

  it('runUnverifiedWalletBackupImport sets busy before await', async () => {
    let busyWhenReplaceCalled = false
    mockReplaceOpfsSqliteAfterDestroy.mockImplementation(async () => {
      busyWhenReplaceCalled = result.current.importBusy
    })

    const file = new File(['zip'], 'backup.zip', { type: 'application/zip' })
    const { result } = renderHook(() => useWalletBackupImport())

    await act(async () => {
      await result.current.onImportFilePick(createZipChangeEvent(file))
    })
    act(() => {
      result.current.confirmWipeImport()
    })

    for (let attempt = 0; attempt < 3; attempt++) {
      await act(async () => {
        await result.current.runVerifiedImport('wrong')
      })
    }

    await act(async () => {
      await result.current.runUnverifiedWalletBackupImport()
    })

    expect(busyWhenReplaceCalled).toBe(true)
    await waitFor(() => {
      expect(result.current.importBusy).toBe(false)
    })
  })
})
