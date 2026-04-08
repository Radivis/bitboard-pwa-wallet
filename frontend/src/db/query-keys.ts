export const walletKeys = {
  all: ['wallets'] as const,
  byId: (id: number) => ['wallets', id] as const,
  noMnemonicBackup: (walletId: number) =>
    ['settings', 'no_mnemonic_backup', walletId] as const,
}

export const libraryKeys = {
  favorites: ['library', 'favorites'] as const,
  /** Prefix for `useLibraryHistory(limit)`; invalidate this root after new history rows. */
  historyRoot: ['library', 'history'] as const,
  history: (limit: number) => [...libraryKeys.historyRoot, limit] as const,
}
