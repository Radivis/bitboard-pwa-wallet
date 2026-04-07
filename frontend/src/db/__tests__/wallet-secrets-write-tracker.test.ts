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
    let done = false
    const p = trackWalletSecretsWrite(
      (async () => {
        await new Promise((r) => setTimeout(r, 5))
        done = true
      })(),
    )
    await awaitInFlightWalletSecretsWrites()
    await p
    expect(done).toBe(true)
  })
})
