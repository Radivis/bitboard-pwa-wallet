import { WALLET_DB_QUERY_KEY_ROOT } from '@/lib/wallet/wallet-query-key-root'

export const walletKeys = {
  all: [...WALLET_DB_QUERY_KEY_ROOT, 'wallets'] as const,
  byId: (id: number) => [...WALLET_DB_QUERY_KEY_ROOT, 'wallets', id] as const,
  detailNone: [...WALLET_DB_QUERY_KEY_ROOT, 'wallets', 'detail', 'none'] as const,
  noMnemonicBackup: (walletId: number) =>
    [...WALLET_DB_QUERY_KEY_ROOT, 'wallets', 'no_mnemonic_backup', walletId] as const,
  noMnemonicBackupNone:
    [...WALLET_DB_QUERY_KEY_ROOT, 'wallets', 'no_mnemonic_backup', 'none'] as const,
}

export const libraryKeys = {
  favorites: ['library', 'favorites'] as const,
  /** Prefix for `useLibraryHistory(limit)`; invalidate this root after new history rows. */
  historyRoot: ['library', 'history'] as const,
  history: (limit: number) => [...libraryKeys.historyRoot, limit] as const,
}
