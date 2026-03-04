import { describe, it, expect, beforeEach } from 'vitest';
import { useCryptoStore } from '../cryptoStore';

/**
 * Note: These tests require a browser environment with Worker support.
 * The jsdom environment doesn't support Web Workers by default.
 * 
 * To run these tests:
 * 1. Use @vitest/browser or playwright-test for actual worker testing
 * 2. Or mock the worker factory for unit testing the store logic
 * 
 * For now, these tests serve as documentation of expected behavior.
 * The actual integration is tested manually via the CryptoTest component.
 */
describe.skip('cryptoStore (requires browser environment)', () => {
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
    const isValid = await validateMnemonic('invalid word list here test foo bar');
    expect(isValid).toBe(false);
  });

  it('sets error state on failure', async () => {
    const { validateMnemonic } = useCryptoStore.getState();
    
    try {
      await validateMnemonic('');
    } catch (err) {
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
