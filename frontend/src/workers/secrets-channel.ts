/**
 * Main-thread setup for the worker-to-worker secrets channel.
 * Call ensureSecretsChannel() before using resolveDescriptorWallet or updateDescriptorWalletChangeset
 * so that the encryption and crypto workers can communicate without the main thread seeing secrets.
 */

import { transfer } from 'comlink';

let channelReady = false;
let channelPromise: Promise<void> | null = null;

export async function ensureSecretsChannel(): Promise<void> {
  if (channelReady) return;
  if (channelPromise) {
    await channelPromise;
    return;
  }
  channelPromise = (async () => {
    const { port1, port2 } = new MessageChannel();
    const { getEncryptionWorker } = await import('./encryption-factory');
    const { getCryptoWorker } = await import('./crypto-factory');
    await Promise.all([
      getEncryptionWorker().setSecretsPort(transfer(port1, [port1])),
      getCryptoWorker().setSecretsPort(transfer(port2, [port2])),
    ]);
    channelReady = true;
  })();
  await channelPromise;
}
