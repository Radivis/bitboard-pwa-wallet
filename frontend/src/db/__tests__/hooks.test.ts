import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { Kysely } from 'kysely'
import type { Database } from '../schema'
import { createTestDatabase } from '../test-helpers'
import React from 'react'

let testDb: Kysely<Database>

vi.mock('../database', () => ({
  getDatabase: () => testDb,
  ensureMigrated: async () => {},
}))

import {
  useWallets,
  useWalletsByNetwork,
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

function createWalletValues(overrides: Partial<{ name: string; network: string; created_at: string }> = {}) {
  return {
    name: 'Test Wallet',
    network: 'signet',
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

  describe('useWalletsByNetwork', () => {
    it('returns only wallets for the specified network', async () => {
      await testDb.insertInto('wallets').values(createWalletValues({ name: 'Signet 1' })).execute()
      await testDb.insertInto('wallets').values(createWalletValues({ name: 'Mainnet 1', network: 'mainnet' })).execute()
      await testDb.insertInto('wallets').values(createWalletValues({ name: 'Signet 2' })).execute()

      const { wrapper } = createQueryClientWrapper()
      const { result } = renderHook(() => useWalletsByNetwork('signet'), { wrapper })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(result.current.data).toHaveLength(2)
      expect(result.current.data!.every((w) => w.network === 'signet')).toBe(true)
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
  })

  describe('useAddWallet', () => {
    it('inserts a wallet and invalidates the wallet queries', async () => {
      const { wrapper, queryClient } = createQueryClientWrapper()
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
        await deleteResult.current.mutateAsync(walletId)
      })

      await waitFor(() => expect(walletsResult.current.data).toHaveLength(0))
    })
  })
})
