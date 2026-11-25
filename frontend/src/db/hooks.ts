import { useQuery, useMutation, useMutationState, useQueryClient } from '@tanstack/react-query'
import { useWalletStore } from '@/stores/walletStore'
import { getDatabase, ensureSchemaAndDataMigrated } from './database'
import { getAllBookmarkSlugs, setArticleBookmark } from './library-articles'
import { listLibraryHistory } from './library-history'
import { walletHasNoMnemonicBackupFlag } from './wallet-no-mnemonic-backup'
import { deleteWalletCompletely } from './wallet-persistence'
import { libraryKeys, walletKeys } from './query-keys'
import type { NewWallet, WalletUpdate } from './schema'
import { mapDbWalletToDomain } from './wallet-domain-mapper'
import { invalidateWalletRelatedQueriesAndNotifyOtherTabs } from '@/lib/wallet/wallet-query-cache-sync'

export function useWallets() {
  return useQuery({
    queryKey: walletKeys.all,
    queryFn: async () => {
      await ensureSchemaAndDataMigrated()
      const rows = await getDatabase().selectFrom('wallets').selectAll().execute()
      return rows.map(mapDbWalletToDomain)
    },
    refetchOnWindowFocus: 'always',
  })
}

export function useWallet(walletId: number | null) {
  return useQuery({
    queryKey: walletId === null ? walletKeys.detailNone : walletKeys.byId(walletId),
    queryFn: async () => {
      await ensureSchemaAndDataMigrated()
      const wallet = await getDatabase()
        .selectFrom('wallets')
        .selectAll()
        .where('wallet_id', '=', walletId!)
        .executeTakeFirst()
      return wallet != null ? mapDbWalletToDomain(wallet) : null
    },
    enabled: walletId !== null,
    refetchOnWindowFocus: 'always',
  })
}

export function useAddWallet() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (wallet: NewWallet) => {
      await ensureSchemaAndDataMigrated()
      const insertResult = await getDatabase()
        .insertInto('wallets')
        .values(wallet)
        .executeTakeFirstOrThrow()
      return Number(insertResult.insertId)
    },
    onSuccess: () => {
      invalidateWalletRelatedQueriesAndNotifyOtherTabs(queryClient)
    },
  })
}

export function useUpdateWallet() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      walletId,
      walletChanges,
    }: {
      walletId: number
      walletChanges: WalletUpdate
    }) => {
      await ensureSchemaAndDataMigrated()
      await getDatabase()
        .updateTable('wallets')
        .set(walletChanges)
        .where('wallet_id', '=', walletId)
        .execute()
    },
    onSuccess: () => {
      invalidateWalletRelatedQueriesAndNotifyOtherTabs(queryClient)
    },
  })
}

export function useDeleteWallet() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      const activeWalletId = useWalletStore.getState().activeWalletId
      if (id !== activeWalletId) {
        throw new Error('Only the active wallet can be deleted')
      }
      // Dynamic import avoids a module cycle: this hook is re-exported from `@/db`,
      // which Arkade session code imports.
      const { discardArkadeSessionForWalletDeletion } = await import(
        '@/lib/arkade/arkade-session-service'
      )
      await discardArkadeSessionForWalletDeletion()
      await ensureSchemaAndDataMigrated()
      await deleteWalletCompletely(getDatabase(), id)
    },
    onSuccess: () => {
      invalidateWalletRelatedQueriesAndNotifyOtherTabs(queryClient)
    },
  })
}

export function useWalletNoMnemonicBackupFlag(walletId: number | null) {
  return useQuery({
    queryKey:
      walletId === null
        ? walletKeys.noMnemonicBackupNone
        : walletKeys.noMnemonicBackup(walletId),
    queryFn: async () => {
      await ensureSchemaAndDataMigrated()
      if (walletId === null) return false
      return walletHasNoMnemonicBackupFlag(getDatabase(), walletId)
    },
    enabled: walletId !== null,
    refetchOnWindowFocus: 'always',
  })
}

export function useLibraryBookmarks() {
  return useQuery({
    queryKey: libraryKeys.bookmarks,
    queryFn: async () => {
      await ensureSchemaAndDataMigrated()
      const slugs = await getAllBookmarkSlugs(getDatabase())
      return new Set(slugs)
    },
  })
}

type SetArticleBookmarkInput = {
  articleSlug: string
  isBookmarked: boolean
}

function articleSlugFromBookmarkMutation(variables: unknown): string | undefined {
  if (typeof variables !== 'object' || variables == null || !('articleSlug' in variables)) return undefined
  const articleSlug = variables.articleSlug
  return typeof articleSlug === 'string' ? articleSlug : undefined
}

export function useSetArticleBookmark() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationKey: libraryKeys.setBookmark,
    mutationFn: async (params: SetArticleBookmarkInput) => {
      await ensureSchemaAndDataMigrated()
      await setArticleBookmark(getDatabase(), params.articleSlug, params.isBookmarked)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: libraryKeys.bookmarks })
    },
  })
}

/** Slugs with a bookmark save in flight, across every list and the article page. */
export function usePendingBookmarkSlugs(): ReadonlySet<string> {
  const pendingSlugs = useMutationState({
    filters: { mutationKey: libraryKeys.setBookmark, status: 'pending' },
    select: (mutation) => articleSlugFromBookmarkMutation(mutation.state.variables),
  })
  return new Set(pendingSlugs.filter((slug): slug is string => slug != null))
}

export function useLibraryHistory(limit: number) {
  return useQuery({
    queryKey: libraryKeys.history(limit),
    queryFn: async () => {
      await ensureSchemaAndDataMigrated()
      return listLibraryHistory(getDatabase(), limit)
    },
  })
}
