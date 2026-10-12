import { describe, expect, it, vi } from 'vitest'
import {
  awaitInFlightWalletSecretsWrites,
  trackWalletSecretsWrite,
  WALLET_SECRETS_FLUSH_TIMEOUT_MS,
} from '@/db/wallet-secrets-write-tracker'

describe('wallet-secrets-write-tracker', () => {
  it('awaitInFlightWalletSecretsWrites resolves when no pending writes', async () => {
    await expect(awaitInFlightWalletSecretsWrites()).resolves.toBeUndefined()
  })

  it('waits for tracked promise before returning', async () => {
    let writeCompleted = false
    const trackedWritePromise = trackWalletSecretsWrite(
      (async () => {
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 5))
        writeCompleted = true
      })(),
    )
    await awaitInFlightWalletSecretsWrites()
    await trackedWritePromise
    expect(writeCompleted).toBe(true)
  })

  it('LIFE-SECRETS-02 stops waiting at the deadline when a write never settles', async () => {
    vi.useFakeTimers()
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    let settleStalledWrite: () => void = () => undefined
    const stalledWrite = trackWalletSecretsWrite(
      new Promise<void>((resolve) => {
        settleStalledWrite = resolve
      }),
    )
    try {
      let waitEnded = false
      void awaitInFlightWalletSecretsWrites().then(() => {
        waitEnded = true
      })
      await vi.advanceTimersByTimeAsync(WALLET_SECRETS_FLUSH_TIMEOUT_MS + 1)
      expect(waitEnded).toBe(true)
    } finally {
      settleStalledWrite()
      await stalledWrite
      consoleErrorSpy.mockRestore()
      vi.useRealTimers()
    }
  })
})
