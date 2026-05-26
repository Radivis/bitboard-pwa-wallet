/** Thrown when a ZIP does not contain the expected backup entries. */
export class BackupZipInvalidError extends Error {
  constructor(
    public readonly backupKind: 'wallet' | 'lab',
    message: string,
  ) {
    super(message)
    this.name = 'BackupZipInvalidError'
  }
}

export class WalletBackupZipInvalidError extends BackupZipInvalidError {
  constructor(message: string) {
    super('wallet', message)
    this.name = 'WalletBackupZipInvalidError'
  }
}

export class LabBackupZipInvalidError extends BackupZipInvalidError {
  constructor(message: string) {
    super('lab', message)
    this.name = 'LabBackupZipInvalidError'
  }
}
