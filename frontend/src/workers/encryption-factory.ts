import { wrap, type Remote } from 'comlink';
import type { EncryptionService } from './encryption-api';

let worker: Worker | null = null;
let proxy: Remote<EncryptionService> | null = null;

export function getEncryptionWorker(): Remote<EncryptionService> {
  if (!worker || !proxy) {
    worker = new Worker(new URL('./encryption.worker.ts', import.meta.url), {
      type: 'module',
    });
    proxy = wrap<EncryptionService>(worker);
  }
  return proxy;
}
