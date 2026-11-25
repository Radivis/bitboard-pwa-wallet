import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const setArticleBookmarkMock = vi.hoisted(() => vi.fn())

vi.mock('../database', () => ({
  getDatabase: () => ({}),
  ensureSchemaAndDataMigrated: async () => {},
}))

vi.mock('../library-articles', () => ({
  setArticleBookmark: (...args: unknown[]) => setArticleBookmarkMock(...args),
  getAllBookmarkSlugs: async () => [],
  getBookmarkBySlug: async () => false,
}))

import { usePendingBookmarkSlugs, useSetArticleBookmark } from '../hooks'

function renderBookmarkHooks() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children)
  const starter = renderHook(() => useSetArticleBookmark(), { wrapper })
  const observer = renderHook(() => usePendingBookmarkSlugs(), { wrapper })
  return { starter, observer }
}

describe('usePendingBookmarkSlugs', () => {
  beforeEach(() => {
    setArticleBookmarkMock.mockReset()
  })

  it('marks a slug pending for a second observer while the first save is in flight', async () => {
    let releaseSave: () => void = () => {}
    const saveGate = new Promise<void>((resolve) => {
      releaseSave = resolve
    })
    setArticleBookmarkMock.mockImplementation(() => saveGate)

    const { starter, observer } = renderBookmarkHooks()
    let save: Promise<unknown> = Promise.resolve()
    act(() => {
      save = starter.result.current.mutateAsync({
        articleSlug: 'what-is-a-wallet',
        isBookmarked: true,
      })
    })

    await waitFor(() => {
      expect(observer.result.current.has('what-is-a-wallet')).toBe(true)
    })
    expect(observer.result.current.has('segwit')).toBe(false)

    releaseSave()
    await act(async () => {
      await save
    })

    await waitFor(() => {
      expect(observer.result.current.has('what-is-a-wallet')).toBe(false)
    })
  })
})
