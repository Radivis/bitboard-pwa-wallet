/**
 * Main-thread setup for worker-to-worker secrets channels.
 * Call ensureSecretsChannel() before using resolveDescriptorWallet,
 * updateDescriptorWalletChangeset, or readLastSuccessfulEsploraSyncAtForDescriptorWallet
 * so that the encryption and crypto workers can communicate without the main thread seeing secrets.
 *
 * Call ensureArkadeWorkerSecretsChannel() before Arkade openSession (or use getArkadeWorker after
 * ensureSecretsChannel) so the arkade worker decrypts via the same encryption worker path.
 */

import { transfer } from 'comlink'

let cryptoSecretsChannelReady = false
let arkadeSecretsChannelReady = false
let cryptoChannelPromise: Promise<void> | null = null
let arkadeChannelPromise: Promise<void> | null = null

/**
 * Reset channel state so the next ensureSecretsChannel() will re-establish
 * the worker-to-worker connection. Call this when terminating the crypto worker
 * (e.g. on manual lock) so that after unlock a new worker gets a valid secrets port.
 */
export function resetSecretsChannel(): void {
  cryptoSecretsChannelReady = false
  arkadeSecretsChannelReady = false
  cryptoChannelPromise = null
  arkadeChannelPromise = null
}

/** Reset only the arkade worker secrets port (e.g. when terminating the arkade worker). */
export function resetArkadeWorkerSecretsChannel(): void {
  arkadeSecretsChannelReady = false
  arkadeChannelPromise = null
}

async function ensureCryptoSecretsChannel(): Promise<void> {
  if (cryptoSecretsChannelReady) return
  if (cryptoChannelPromise) {
    await cryptoChannelPromise
    return
  }
  const setupPromise = (async () => {
    try {
      const { port1, port2 } = new MessageChannel()
      const { getEncryptionWorker } = await import('./encryption-factory')
      const { getCryptoWorker } = await import('./crypto-factory')
      await Promise.all([
        getEncryptionWorker().setSecretsPort(transfer(port1, [port1])),
        getCryptoWorker().setSecretsPort(transfer(port2, [port2])),
      ])
      cryptoSecretsChannelReady = true
    } catch (error) {
      cryptoSecretsChannelReady = false
      const detail = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to establish secrets channel: ${detail}`, {
        cause: error,
      })
    }
  })()
  cryptoChannelPromise = setupPromise.finally(() => {
    cryptoChannelPromise = null
  })
  await cryptoChannelPromise
}

/**
 * Connect the arkade worker to the encryption worker for decrypt/encrypt RPC.
 * Requires the crypto secrets channel to be established first.
 */
export async function ensureArkadeWorkerSecretsChannel(): Promise<void> {
  await ensureCryptoSecretsChannel()
  if (arkadeSecretsChannelReady) return
  if (arkadeChannelPromise) {
    await arkadeChannelPromise
    return
  }
  const setupPromise = (async () => {
    const { getArkadeWorkerIfExists } = await import('./arkade-factory')
    const arkadeWorker = getArkadeWorkerIfExists()
    if (arkadeWorker == null) {
      return
    }
    try {
      const { port1, port2 } = new MessageChannel()
      const { getEncryptionWorker } = await import('./encryption-factory')
      await Promise.all([
        getEncryptionWorker().setSecretsPort(transfer(port1, [port1])),
        arkadeWorker.setSecretsPort(transfer(port2, [port2])),
      ])
      arkadeSecretsChannelReady = true
    } catch (error) {
      arkadeSecretsChannelReady = false
      const detail = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to establish arkade secrets channel: ${detail}`, {
        cause: error,
      })
    }
  })()
  arkadeChannelPromise = setupPromise.finally(() => {
    arkadeChannelPromise = null
  })
  await arkadeChannelPromise
}

export async function ensureSecretsChannel(): Promise<void> {
  await ensureCryptoSecretsChannel()
  await ensureArkadeWorkerSecretsChannel()
}
