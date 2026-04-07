import { describe, expect, it } from 'vitest'
import {
  awaitInFlightWalletSecretsWrites,
  trackWalletSecretsWrite,
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
})
