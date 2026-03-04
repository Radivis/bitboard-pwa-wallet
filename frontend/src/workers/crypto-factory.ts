import { wrap, type Remote } from 'comlink';
import type { CryptoService } from './crypto-api';

let workerInstance: Worker | null = null;
let proxyInstance: Remote<CryptoService> | null = null;

export function getCryptoWorker(): Remote<CryptoService> {
  if (!proxyInstance) {
    workerInstance = new Worker(
      new URL('./crypto.worker.ts', import.meta.url),
      { type: 'module' }
    );
    
    workerInstance.addEventListener('error', (event) => {
      console.error('[crypto-factory] Worker error:', event.message, event);
    });
    
    workerInstance.addEventListener('messageerror', (event) => {
      console.error('[crypto-factory] Worker message error:', event);
    });
    
    proxyInstance = wrap<CryptoService>(workerInstance);
  }
  return proxyInstance;
}

export function terminateCryptoWorker(): void {
  if (workerInstance) {
    workerInstance.terminate();
    workerInstance = null;
    proxyInstance = null;
  }
}
