/** Thrown when wallet SQLite accessors run after factory-reset hard-block. */
export class WalletDatabaseTeardownBlockedError extends Error {
  static readonly message = 'Wallet database access blocked during teardown'

  constructor() {
    super(WalletDatabaseTeardownBlockedError.message)
    this.name = 'WalletDatabaseTeardownBlockedError'
  }
}

export function isWalletDatabaseTeardownBlockedError(error: unknown): boolean {
  return error instanceof WalletDatabaseTeardownBlockedError
}

/** Thrown when lab SQLite accessors run after factory-reset hard-block. */
export class LabDatabaseTeardownBlockedError extends Error {
  static readonly message = 'Lab database access blocked during teardown'

  constructor() {
    super(LabDatabaseTeardownBlockedError.message)
    this.name = 'LabDatabaseTeardownBlockedError'
  }
}

export function isLabDatabaseTeardownBlockedError(error: unknown): boolean {
  return error instanceof LabDatabaseTeardownBlockedError
}
