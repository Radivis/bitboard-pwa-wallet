import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { Kysely } from 'kysely'
import type { Database } from '../schema'
import { createTestDatabase } from '../test-helpers'
import { ARGON2_KDF_PHC_CI } from '@/lib/kdf-phc-constants'
import React from 'react'

let testDb: Kysely<Database>

vi.mock('../database', () => ({
  getDatabase: () => testDb,
  ensureMigrated: async () => {},
}))

import { useWalletStore } from '@/stores/walletStore'
import {
  useWallets,
  useWallet,
  useAddWallet,
  useUpdateWallet,
  useDeleteWallet,
} from '../hooks'

function createQueryClientWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  })

  return {
    queryClient,
    wrapper: ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: queryClient }, children),
  }
}

function createWalletValues(overrides: Partial<{ name: string; created_at: string }> = {}) {
  return {
    name: 'Test Wallet',
    created_at: new Date().toISOString(),
    ...overrides,
  }
}

describe('TanStack Query hooks', () => {
  beforeEach(async () => {
    testDb = await createTestDatabase()
  })

  afterEach(async () => {
    await testDb.destroy()
  })

  describe('useWallets', () => {
    it('returns an empty array when no wallets exist', async () => {
      const { wrapper } = createQueryClientWrapper()
      const { result } = renderHook(() => useWallets(), { wrapper })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(result.current.data).toEqual([])
    })

    it('returns all wallets', async () => {
      await testDb.insertInto('wallets').values(createWalletValues({ name: 'Wallet A' })).execute()
      await testDb.insertInto('wallets').values(createWalletValues({ name: 'Wallet B' })).execute()

      const { wrapper } = createQueryClientWrapper()
      const { result } = renderHook(() => useWallets(), { wrapper })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(result.current.data).toHaveLength(2)
    })
  })

  describe('useWallet', () => {
    it('returns a single wallet by id', async () => {
      const insertResult = await testDb
        .insertInto('wallets')
        .values(createWalletValues({ name: 'Target Wallet' }))
        .executeTakeFirstOrThrow()
      const walletId = Number(insertResult.insertId)

      const { wrapper } = createQueryClientWrapper()
      const { result } = renderHook(() => useWallet(walletId), { wrapper })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(result.current.data?.name).toBe('Target Wallet')
    })

    it('returns null for a non-existent id', async () => {
      const { wrapper } = createQueryClientWrapper()
      const { result } = renderHook(() => useWallet(999), { wrapper })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(result.current.data).toBeNull()
    })

    it('does not fetch when id is null', async () => {
      const { wrapper } = createQueryClientWrapper()
      const { result } = renderHook(() => useWallet(null), { wrapper })

      expect(result.current.fetchStatus).toBe('idle')
      expect(result.current.data).toBeUndefined()
    })
  })

  describe('useAddWallet', () => {
    it('inserts a wallet and invalidates the wallet queries', async () => {
      const { wrapper } = createQueryClientWrapper()
      const { result: walletsResult } = renderHook(() => useWallets(), { wrapper })
      const { result: addResult } = renderHook(() => useAddWallet(), { wrapper })

      await waitFor(() => expect(walletsResult.current.isSuccess).toBe(true))
      expect(walletsResult.current.data).toHaveLength(0)

      await act(async () => {
        await addResult.current.mutateAsync(createWalletValues({ name: 'New Wallet' }))
      })

      await waitFor(() => expect(walletsResult.current.data).toHaveLength(1))
      expect(walletsResult.current.data![0].name).toBe('New Wallet')
    })
  })

  describe('useUpdateWallet', () => {
    it('updates a wallet and invalidates the wallet queries', async () => {
      const insertResult = await testDb
        .insertInto('wallets')
        .values(createWalletValues({ name: 'Original Name' }))
        .executeTakeFirstOrThrow()
      const walletId = Number(insertResult.insertId)

      const { wrapper } = createQueryClientWrapper()
      const { result: walletsResult } = renderHook(() => useWallets(), { wrapper })
      const { result: updateResult } = renderHook(() => useUpdateWallet(), { wrapper })

      await waitFor(() => expect(walletsResult.current.isSuccess).toBe(true))
      expect(walletsResult.current.data![0].name).toBe('Original Name')

      await act(async () => {
        await updateResult.current.mutateAsync({ id: walletId, changes: { name: 'Updated Name' } })
      })

      await waitFor(() => expect(walletsResult.current.data![0].name).toBe('Updated Name'))
    })
  })

  describe('useDeleteWallet', () => {
    it('deletes a wallet and invalidates the wallet queries', async () => {
      const insertResult = await testDb
        .insertInto('wallets')
        .values(createWalletValues())
        .executeTakeFirstOrThrow()
      const walletId = Number(insertResult.insertId)

      const { wrapper } = createQueryClientWrapper()
      const { result: walletsResult } = renderHook(() => useWallets(), { wrapper })
      const { result: deleteResult } = renderHook(() => useDeleteWallet(), { wrapper })

      await waitFor(() => expect(walletsResult.current.data).toHaveLength(1))

      await act(async () => {
        useWalletStore.getState().setActiveWallet(walletId)
        await deleteResult.current.mutateAsync(walletId)
      })

      await waitFor(() => expect(walletsResult.current.data).toHaveLength(0))
    })

    it('removes the wallet_secrets row for that wallet', async () => {
      const now = new Date().toISOString()
      const insertResult = await testDb
        .insertInto('wallets')
        .values(createWalletValues())
        .executeTakeFirstOrThrow()
      const walletId = Number(insertResult.insertId)
      await testDb
        .insertInto('wallet_secrets')
        .values({
          wallet_id: walletId,
          revision: 0,
          encrypted_data: new Uint8Array([1]),
          iv: new Uint8Array(12),
          salt: new Uint8Array(16),
          kdf_phc: ARGON2_KDF_PHC_CI,
          mnemonic_encrypted_data: new Uint8Array([1]),
          mnemonic_iv: new Uint8Array(12),
          mnemonic_salt: new Uint8Array(16),
          mnemonic_kdf_phc: ARGON2_KDF_PHC_CI,
          created_at: now,
          updated_at: now,
        })
        .execute()

      const { wrapper } = createQueryClientWrapper()
      const { result: deleteResult } = renderHook(() => useDeleteWallet(), { wrapper })

      await act(async () => {
        useWalletStore.getState().setActiveWallet(walletId)
        await deleteResult.current.mutateAsync(walletId)
      })

      const secretRow = await testDb
        .selectFrom('wallet_secrets')
        .selectAll()
        .where('wallet_id', '=', walletId)
        .executeTakeFirst()
      expect(secretRow).toBeUndefined()
    })

    it('rejects when the wallet id is not the active wallet', async () => {
      const insertA = await testDb
        .insertInto('wallets')
        .values(createWalletValues({ name: 'Wallet A' }))
        .executeTakeFirstOrThrow()
      const idA = Number(insertA.insertId)
      const insertB = await testDb
        .insertInto('wallets')
        .values(createWalletValues({ name: 'Wallet B' }))
        .executeTakeFirstOrThrow()
      const idB = Number(insertB.insertId)

      const { wrapper } = createQueryClientWrapper()
      const { result: deleteResult } = renderHook(() => useDeleteWallet(), { wrapper })

      await act(async () => {
        useWalletStore.getState().setActiveWallet(idA)
      })

      await expect(deleteResult.current.mutateAsync(idB)).rejects.toThrow(
        'Only the active wallet can be deleted',
      )

      const rowB = await testDb
        .selectFrom('wallets')
        .select('wallet_id')
        .where('wallet_id', '=', idB)
        .executeTakeFirst()
      expect(rowB).toBeDefined()
    })
  })
})
