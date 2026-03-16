import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useCryptoStore } from '../cryptoStore';

/**
 * cryptoStore unit tests with a mocked worker factory.
 * Worker creation and Comlink are not used; the store's logic (error handling,
 * delegation to worker) is tested against a fake CryptoService.
 * Real worker integration is covered by E2E (crypto-integration.spec.ts).
 */
vi.mock('@/workers/crypto-factory', () => {
  let lastGeneratedMnemonic = '';
  const mockWorker = {
    ping: async () => true,
    generateMnemonic: async (wordCount: 12 | 24) => {
      const words = Array.from(
        { length: wordCount },
        (_, i) => `word${i + 1}`,
      );
      lastGeneratedMnemonic = words.join(' ');
      return lastGeneratedMnemonic;
    },
    validateMnemonic: async (mnemonic: string) => {
      if (mnemonic === '') {
        throw new Error('Mnemonic cannot be empty');
      }
      if (mnemonic === 'invalid word list here test foo bar') {
        return false;
      }
      return mnemonic === lastGeneratedMnemonic;
    },
  };
  return {
    getCryptoWorker: () => mockWorker,
    terminateCryptoWorker: vi.fn(),
    onWorkerHealthChange: (
      listener: (status: string, error: string | null) => void,
    ) => {
      listener('healthy', null);
      return () => {};
    },
  };
});

describe('cryptoStore', () => {
  beforeEach(() => {
    const { terminateWorker } = useCryptoStore.getState();
    terminateWorker();
  });

  it('generates a 12-word mnemonic', async () => {
    const { generateMnemonic } = useCryptoStore.getState();
    const mnemonic = await generateMnemonic(12);
    expect(mnemonic.split(' ')).toHaveLength(12);
  });

  it('generates a 24-word mnemonic', async () => {
    const { generateMnemonic } = useCryptoStore.getState();
    const mnemonic = await generateMnemonic(24);
    expect(mnemonic.split(' ')).toHaveLength(24);
  });

  it('validates correct mnemonic', async () => {
    const { generateMnemonic, validateMnemonic } = useCryptoStore.getState();
    const mnemonic = await generateMnemonic(12);
    const isValid = await validateMnemonic(mnemonic);
    expect(isValid).toBe(true);
  });

  it('rejects invalid mnemonic', async () => {
    const { validateMnemonic } = useCryptoStore.getState();
    const isValid = await validateMnemonic(
      'invalid word list here test foo bar',
    );
    expect(isValid).toBe(false);
  });

  it('sets error state on failure', async () => {
    const { validateMnemonic } = useCryptoStore.getState();

    try {
      await validateMnemonic('');
    } catch {
      // Expected to throw
    }

    const { error } = useCryptoStore.getState();
    expect(error).toBeTruthy();
  });

  it('clears error state on success', async () => {
    const { generateMnemonic } = useCryptoStore.getState();

    await generateMnemonic(12);

    const { error } = useCryptoStore.getState();
    expect(error).toBeNull();
  });
});
