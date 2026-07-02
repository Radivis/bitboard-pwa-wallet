import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createOpfsWriterLock,
  LAB_WRITER_LOCK_NAME,
  resetLabWriterLockForTests,
  resetWalletWriterLockForTests,
  WALLET_WRITER_LOCK_NAME,
  withLabWriterLock,
  withWalletWriterLock,
} from '@/lib/shared/opfs-writer-lock'

describe('opfs-writer-lock', () => {
  const originalNavigator = globalThis.navigator

  beforeEach(() => {
    resetWalletWriterLockForTests()
    resetLabWriterLockForTests()
  })

  afterEach(() => {
    Object.defineProperty(globalThis, 'navigator', {
      value: originalNavigator,
      configurable: true,
    })
  })

  it('runs work when navigator.locks is absent', async () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: {},
      configurable: true,
    })

    const work = vi.fn().mockResolvedValue('ok')
    await expect(withWalletWriterLock(work)).resolves.toBe('ok')
    expect(work).toHaveBeenCalledTimes(1)
  })

  it('same-tab nested calls request lock only once', async () => {
    const request = vi.fn(
      async (_name: string, _options: unknown, callback: () => Promise<unknown>) =>
        callback(),
    )
    Object.defineProperty(globalThis, 'navigator', {
      value: { locks: { request } },
      configurable: true,
    })

    const inner = vi.fn().mockResolvedValue(undefined)
    const outer = vi.fn(async () => {
      await withWalletWriterLock(inner)
    })

    await withWalletWriterLock(outer)

    expect(request).toHaveBeenCalledTimes(1)
    expect(request).toHaveBeenCalledWith(
      WALLET_WRITER_LOCK_NAME,
      { mode: 'exclusive' },
      expect.any(Function),
    )
    expect(outer).toHaveBeenCalledTimes(1)
    expect(inner).toHaveBeenCalledTimes(1)
  })

  it('wallet and lab locks are independent', async () => {
    const heldLocks = new Set<string>()
    const request = vi.fn(
      async (name: string, _options: unknown, callback: () => Promise<unknown>) => {
        heldLocks.add(name)
        try {
          return await callback()
        } finally {
          heldLocks.delete(name)
        }
      },
    )
    Object.defineProperty(globalThis, 'navigator', {
      value: { locks: { request } },
      configurable: true,
    })

    let releaseWallet!: () => void
    const walletGate = new Promise<void>((resolve) => {
      releaseWallet = resolve
    })

    const walletWork = withWalletWriterLock(async () => {
      await walletGate
    })
    await vi.waitFor(() => expect(heldLocks.has(WALLET_WRITER_LOCK_NAME)).toBe(true))

    await withLabWriterLock(async () => {
      expect(heldLocks.has(WALLET_WRITER_LOCK_NAME)).toBe(true)
      expect(heldLocks.has(LAB_WRITER_LOCK_NAME)).toBe(true)
    })

    releaseWallet()
    await walletWork

    expect(request).toHaveBeenCalledWith(
      WALLET_WRITER_LOCK_NAME,
      { mode: 'exclusive' },
      expect.any(Function),
    )
    expect(request).toHaveBeenCalledWith(
      LAB_WRITER_LOCK_NAME,
      { mode: 'exclusive' },
      expect.any(Function),
    )
  })

  it('serializes sequential top-level writes via same-tab chain', async () => {
    const { withWriterLock } = createOpfsWriterLock('test-writer-lock')
    const order: string[] = []

    await withWriterLock(async () => {
      order.push('first')
    })
    await withWriterLock(async () => {
      order.push('second')
    })

    expect(order).toEqual(['first', 'second'])
  })
})
