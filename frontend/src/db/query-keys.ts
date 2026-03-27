export const walletKeys = {
  all: ['wallets'] as const,
  byId: (id: number) => ['wallets', id] as const,
}

export const libraryKeys = {
  favorites: ['library', 'favorites'] as const,
  /** Prefix for `useLibraryHistory(limit)`; invalidate this root after new history rows. */
  historyRoot: ['library', 'history'] as const,
  history: (limit: number) => [...libraryKeys.historyRoot, limit] as const,
}
