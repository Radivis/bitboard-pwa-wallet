/**
 * Main-thread setup for the worker-to-worker secrets channel.
 * Call ensureSecretsChannel() before using resolveDescriptorWallet or updateDescriptorWalletChangeset
 * so that the encryption and crypto workers can communicate without the main thread seeing secrets.
 */

import { transfer } from 'comlink';

let channelReady = false;
let channelPromise: Promise<void> | null = null;

/**
 * Reset channel state so the next ensureSecretsChannel() will re-establish
 * the worker-to-worker connection. Call this when terminating the crypto worker
 * (e.g. on manual lock) so that after unlock a new worker gets a valid secrets port.
 */
export function resetSecretsChannel(): void {
  channelReady = false;
  channelPromise = null;
}

export async function ensureSecretsChannel(): Promise<void> {
  if (channelReady) return;
  if (channelPromise) {
    await channelPromise;
    return;
  }
  const setupPromise = (async () => {
    try {
      const { port1, port2 } = new MessageChannel();
      const { getEncryptionWorker } = await import('./encryption-factory');
      const { getCryptoWorker } = await import('./crypto-factory');
      await Promise.all([
        getEncryptionWorker().setSecretsPort(transfer(port1, [port1])),
        getCryptoWorker().setSecretsPort(transfer(port2, [port2])),
      ]);
      channelReady = true;
    } catch (error) {
      channelReady = false;
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to establish secrets channel: ${detail}`);
    }
  })();
  channelPromise = setupPromise.finally(() => {
    channelPromise = null;
  });
  await channelPromise;
}
