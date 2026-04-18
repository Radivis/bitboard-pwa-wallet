import { wrap, type Remote } from 'comlink';
import type { CryptoService } from './crypto-api';

export type WorkerHealthStatus = 'initializing' | 'healthy' | 'error' | 'crashed';

interface WorkerState {
  worker: Worker;
  proxy: Remote<CryptoService>;
  status: WorkerHealthStatus;
  lastError: string | null;
  pollTimer: ReturnType<typeof setInterval> | null;
}

const HEALTH_POLL_INTERVAL_MS = 5_000;

/** Poll interval while waiting for the initial post-construction health check. */
const WORKER_STARTUP_POLL_MS = 25;
const WORKER_STARTUP_TIMEOUT_MS = 30_000;

let state: WorkerState | null = null;
const statusListeners = new Set<(status: WorkerHealthStatus, error: string | null) => void>();

function notifyListeners() {
  if (!state) return;
  for (const listener of statusListeners) {
    listener(state.status, state.lastError);
  }
}

function setStatus(newStatus: WorkerHealthStatus, error: string | null = null) {
  if (!state) return;
  state.status = newStatus;
  state.lastError = error;
  notifyListeners();
}

function startHealthPolling() {
  if (!state || state.pollTimer) return;

  state.pollTimer = setInterval(async () => {
    if (!state) return;
    try {
      await state.proxy.ping();
      if (state.status === 'crashed') {
        setStatus('healthy');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[crypto-factory] Health poll failed:', message);
      setStatus('crashed', message);
    }
  }, HEALTH_POLL_INTERVAL_MS);
}

function stopHealthPolling() {
  if (!state?.pollTimer) return;
  clearInterval(state.pollTimer);
  state.pollTimer = null;
}

async function verifyWorkerHealth(proxy: Remote<CryptoService>): Promise<void> {
  try {
    await proxy.ping();
    setStatus('healthy');
    console.info('[crypto-factory] Worker health check passed');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[crypto-factory] Worker health check failed:', message);
    setStatus('error', message);
    throw new Error(`Crypto worker failed to initialize: ${message}`, {
      cause: err,
    });
  }
}

/**
 * Ensures a worker instance exists and {@link verifyWorkerHealth}'s ping has finished.
 * After {@link terminateCryptoWorker}, the next crypto call must wait here or similar;
 * otherwise Comlink operations can run before the worker is ready and fail spuriously.
 */
export async function waitForCryptoWorkerHealthy(): Promise<void> {
  getCryptoWorker();
  const deadline = Date.now() + WORKER_STARTUP_TIMEOUT_MS;
  for (;;) {
    const { status, lastError } = getWorkerHealthStatus();
    if (status === 'healthy') return;
    if (status === 'error' || status === 'crashed') {
      throw new Error(lastError ?? 'Crypto worker unavailable');
    }
    if (Date.now() >= deadline) {
      throw new Error('Crypto worker did not become ready in time');
    }
    await new Promise((r) => setTimeout(r, WORKER_STARTUP_POLL_MS));
  }
}

export function getCryptoWorker(): Remote<CryptoService> {
  if (!state) {
    const worker = new Worker(
      new URL('./crypto.worker.ts', import.meta.url),
      { type: 'module' },
    );

    worker.addEventListener('error', (event) => {
      const message = event.message || 'Unknown worker error';
      console.error('[crypto-factory] Worker error:', message, event);
      setStatus('crashed', message);
    });

    worker.addEventListener('messageerror', (event) => {
      console.error('[crypto-factory] Worker message error:', event);
      setStatus('crashed', 'Message deserialization failed');
    });

    const proxy = wrap<CryptoService>(worker);

    state = {
      worker,
      proxy,
      status: 'initializing',
      lastError: null,
      pollTimer: null,
    };

    verifyWorkerHealth(proxy).then(() => {
      startHealthPolling();
    }).catch(() => {
      startHealthPolling();
    });
  }
  return state.proxy;
}

export function terminateCryptoWorker(): void {
  if (state) {
    stopHealthPolling();
    state.worker.terminate();
    state = null;
  }
}

export function getWorkerHealthStatus(): { status: WorkerHealthStatus; lastError: string | null } {
  if (!state) return { status: 'initializing', lastError: null };
  return { status: state.status, lastError: state.lastError };
}

export function onWorkerHealthChange(
  listener: (status: WorkerHealthStatus, error: string | null) => void,
): () => void {
  statusListeners.add(listener);
  return () => statusListeners.delete(listener);
}
