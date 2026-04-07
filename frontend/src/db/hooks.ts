import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getDatabase, ensureMigrated } from './database'
import { getAllFavoriteSlugs, setArticleFavorite } from './library-articles'
import { listLibraryHistory } from './library-history'
import {
  noMnemonicBackupSettingsKey,
  walletHasNoMnemonicBackupFlag,
} from './no-mnemonic-backup-settings'
import { libraryKeys, walletKeys } from './query-keys'
import type { NewWallet, WalletUpdate } from './schema'

export function useWallets() {
  return useQuery({
    queryKey: walletKeys.all,
    queryFn: async () => {
      await ensureMigrated()
      return getDatabase().selectFrom('wallets').selectAll().execute()
    },
  })
}

export function useWallet(id: number | null) {
  return useQuery({
    queryKey: id === null ? (['wallets', 'detail', 'none'] as const) : walletKeys.byId(id),
    queryFn: async () => {
      await ensureMigrated()
      const wallet = await getDatabase()
        .selectFrom('wallets')
        .selectAll()
        .where('wallet_id', '=', id!)
        .executeTakeFirst()
      return wallet ?? null
    },
    enabled: id !== null,
  })
}

export function useAddWallet() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (wallet: NewWallet) => {
      await ensureMigrated()
      const result = await getDatabase()
        .insertInto('wallets')
        .values(wallet)
        .executeTakeFirstOrThrow()
      return Number(result.insertId)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: walletKeys.all })
    },
  })
}

export function useUpdateWallet() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, changes }: { id: number; changes: WalletUpdate }) => {
      await ensureMigrated()
      await getDatabase()
        .updateTable('wallets')
        .set(changes)
        .where('wallet_id', '=', id)
        .execute()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: walletKeys.all })
    },
  })
}

export function useDeleteWallet() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      await ensureMigrated()
      const walletDb = getDatabase()
      await walletDb
        .deleteFrom('settings')
        .where('key', '=', noMnemonicBackupSettingsKey(id))
        .execute()
      await walletDb
        .deleteFrom('wallets')
        .where('wallet_id', '=', id)
        .execute()
    },
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: walletKeys.all })
      queryClient.invalidateQueries({ queryKey: walletKeys.noMnemonicBackup(id) })
    },
  })
}

export function useWalletNoMnemonicBackupFlag(walletId: number | null) {
  return useQuery({
    queryKey:
      walletId === null
        ? (['settings', 'no_mnemonic_backup', 'none'] as const)
        : walletKeys.noMnemonicBackup(walletId),
    queryFn: async () => {
      await ensureMigrated()
      if (walletId === null) return false
      return walletHasNoMnemonicBackupFlag(getDatabase(), walletId)
    },
    enabled: walletId !== null,
  })
}

export function useLibraryFavorites() {
  return useQuery({
    queryKey: libraryKeys.favorites,
    queryFn: async () => {
      await ensureMigrated()
      const slugs = await getAllFavoriteSlugs(getDatabase())
      return new Set(slugs)
    },
  })
}

export function useSetArticleFavorite() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (params: { articleSlug: string; isFavorite: boolean }) => {
      await ensureMigrated()
      await setArticleFavorite(getDatabase(), params.articleSlug, params.isFavorite)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: libraryKeys.favorites })
    },
  })
}

export function useLibraryHistory(limit: number) {
  return useQuery({
    queryKey: libraryKeys.history(limit),
    queryFn: async () => {
      await ensureMigrated()
      return listLibraryHistory(getDatabase(), limit)
    },
  })
}
