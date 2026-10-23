import { describe, expect, it, vi } from 'vitest'
import {
  decideBarkReceiveCursorOnOpen,
  readBarkLastRevealedKeyIndex,
  readBarkRevealedReceiveAddress,
  receiveKeyIndexForSessionOpen,
} from '@/lib/bark/bark-receive-cursor'

describe('decideBarkReceiveCursorOnOpen', () => {
  it('keeps a stored index and does not treat a later key as the receive cursor', () => {
    expect(
      decideBarkReceiveCursorOnOpen({
        storedReceiveKeyIndex: 0,
        lastRevealedKeyIndex: 4,
      }),
    ).toEqual({ kind: 'keep', receiveKeyIndex: 0 })
  })

  it('recovers the last key when the encrypted index was not written', () => {
    expect(
      decideBarkReceiveCursorOnOpen({
        storedReceiveKeyIndex: undefined,
        lastRevealedKeyIndex: 3,
      }),
    ).toEqual({ kind: 'recover', receiveKeyIndex: 3 })
  })

  it('reveals when Bark has no key and no stored index', () => {
    expect(
      decideBarkReceiveCursorOnOpen({
        storedReceiveKeyIndex: undefined,
        lastRevealedKeyIndex: null,
      }),
    ).toEqual({ kind: 'reveal' })
  })
})

describe('receiveKeyIndexForSessionOpen', () => {
  it('does not reveal on unlock when an index is stored', async () => {
    const readLastRevealedKeyIndex = vi.fn()
    const revealNextReceiveAddress = vi.fn()

    const index = await receiveKeyIndexForSessionOpen({
      storedReceiveKeyIndex: 0,
      readLastRevealedKeyIndex,
      revealNextReceiveAddress,
    })

    expect(index).toBe(0)
    expect(readLastRevealedKeyIndex).not.toHaveBeenCalled()
    expect(revealNextReceiveAddress).not.toHaveBeenCalled()
  })

  it('does not reveal on unlock when a key exists and the index is missing', async () => {
    const revealNextReceiveAddress = vi.fn()

    const index = await receiveKeyIndexForSessionOpen({
      storedReceiveKeyIndex: undefined,
      readLastRevealedKeyIndex: async () => 2,
      revealNextReceiveAddress,
    })

    expect(index).toBe(2)
    expect(revealNextReceiveAddress).not.toHaveBeenCalled()
  })

  it('reveals once on first open when no key exists and returns that index', async () => {
    const revealNextReceiveAddress = vi.fn().mockResolvedValue({
      address: 'tark1qqfirst',
      index: 0,
    })

    const index = await receiveKeyIndexForSessionOpen({
      storedReceiveKeyIndex: undefined,
      readLastRevealedKeyIndex: async () => null,
      revealNextReceiveAddress,
    })

    expect(index).toBe(0)
    expect(revealNextReceiveAddress).toHaveBeenCalledTimes(1)
  })
})

describe('readBarkRevealedReceiveAddress', () => {
  it('copies the address and frees the wasm object', () => {
    const free = vi.fn()
    expect(
      readBarkRevealedReceiveAddress({
        address: 'tark1qqnext',
        index: 1,
        free,
      }),
    ).toEqual({ address: 'tark1qqnext', index: 1 })
    expect(free).toHaveBeenCalledTimes(1)
  })
})

describe('readBarkLastRevealedKeyIndex', () => {
  it('treats null as no key and keeps index 0', () => {
    expect(readBarkLastRevealedKeyIndex(null)).toBeNull()
    expect(readBarkLastRevealedKeyIndex(undefined)).toBeNull()
    expect(readBarkLastRevealedKeyIndex(0)).toBe(0)
  })
})
