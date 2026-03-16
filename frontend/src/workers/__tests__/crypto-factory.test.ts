import { describe, it, expect, beforeEach } from 'vitest';
import {
  getWorkerHealthStatus,
  onWorkerHealthChange,
  terminateCryptoWorker,
  type WorkerHealthStatus,
} from '../crypto-factory';

/**
 * Unit tests for crypto-factory health status and listener API.
 * Worker creation and Comlink are not tested here (no real Worker in jsdom);
 * integration with the worker is covered by E2E (crypto-integration.spec.ts).
 */
describe('crypto-factory', () => {
  beforeEach(() => {
    terminateCryptoWorker();
  });

  it('getWorkerHealthStatus returns initializing when no worker created', () => {
    const { status, lastError } = getWorkerHealthStatus();
    expect(status).toBe('initializing');
    expect(lastError).toBeNull();
  });

  it('onWorkerHealthChange returns an unsubscribe function', () => {
    const listener = (
      _status: WorkerHealthStatus,
      _error: string | null,
    ) => {};
    const unsubscribe = onWorkerHealthChange(listener);
    expect(typeof unsubscribe).toBe('function');
    unsubscribe();
  });

  it('unsubscribe removes the listener', () => {
    const listener = (
      _status: WorkerHealthStatus,
      _error: string | null,
    ) => {};
    const unsubscribe = onWorkerHealthChange(listener);
    unsubscribe();
    // No assertion on internal state; just ensure no throw
  });
});
