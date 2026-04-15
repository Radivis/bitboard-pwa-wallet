import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  assessOpfsLikelyUnsupported,
  isOpfsApiPresent,
  tryProbeOpfsAccess,
} from '@/lib/opfs-capability'

describe('isOpfsApiPresent', () => {
  const originalStorage = navigator.storage

  afterEach(() => {
    Object.defineProperty(navigator, 'storage', {
      value: originalStorage,
      configurable: true,
      writable: true,
    })
  })

  it('returns false when storage is undefined', () => {
    Object.defineProperty(navigator, 'storage', {
      value: undefined,
      configurable: true,
    })
    expect(isOpfsApiPresent()).toBe(false)
  })

  it('returns false when getDirectory is not a function', () => {
    Object.defineProperty(navigator, 'storage', {
      value: {},
      configurable: true,
    })
    expect(isOpfsApiPresent()).toBe(false)
  })

  it('returns true when getDirectory is defined', () => {
    Object.defineProperty(navigator, 'storage', {
      value: { getDirectory: () => Promise.resolve({} as FileSystemDirectoryHandle) },
      configurable: true,
    })
    expect(isOpfsApiPresent()).toBe(true)
  })
})

describe('tryProbeOpfsAccess', () => {
  const originalStorage = navigator.storage

  afterEach(() => {
    Object.defineProperty(navigator, 'storage', {
      value: originalStorage,
      configurable: true,
      writable: true,
    })
  })

  it('returns false when API is missing', async () => {
    Object.defineProperty(navigator, 'storage', {
      value: {},
      configurable: true,
    })
    await expect(tryProbeOpfsAccess()).resolves.toBe(false)
  })

  it('returns false when getDirectory rejects', async () => {
    Object.defineProperty(navigator, 'storage', {
      value: {
        getDirectory: vi.fn(() => Promise.reject(new Error('blocked'))),
      },
      configurable: true,
    })
    await expect(tryProbeOpfsAccess()).resolves.toBe(false)
  })

  it('returns true when getDirectory resolves', async () => {
    Object.defineProperty(navigator, 'storage', {
      value: {
        getDirectory: vi.fn(() =>
          Promise.resolve({} as FileSystemDirectoryHandle),
        ),
      },
      configurable: true,
    })
    await expect(tryProbeOpfsAccess()).resolves.toBe(true)
  })
})

describe('assessOpfsLikelyUnsupported', () => {
  const originalStorage = navigator.storage

  afterEach(() => {
    Object.defineProperty(navigator, 'storage', {
      value: originalStorage,
      configurable: true,
      writable: true,
    })
  })

  it('returns true when getDirectory is absent', async () => {
    Object.defineProperty(navigator, 'storage', {
      value: {},
      configurable: true,
    })
    await expect(assessOpfsLikelyUnsupported()).resolves.toBe(true)
  })

  it('returns true when probe fails', async () => {
    Object.defineProperty(navigator, 'storage', {
      value: {
        getDirectory: vi.fn(() => Promise.reject(new Error('no'))),
      },
      configurable: true,
    })
    await expect(assessOpfsLikelyUnsupported()).resolves.toBe(true)
  })

  it('returns false when OPFS probe succeeds', async () => {
    Object.defineProperty(navigator, 'storage', {
      value: {
        getDirectory: vi.fn(() =>
          Promise.resolve({} as FileSystemDirectoryHandle),
        ),
      },
      configurable: true,
    })
    await expect(assessOpfsLikelyUnsupported()).resolves.toBe(false)
  })
})
