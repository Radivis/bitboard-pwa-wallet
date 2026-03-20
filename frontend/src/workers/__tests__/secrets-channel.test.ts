import { describe, it, expect, beforeEach, vi } from 'vitest';

const encryptionSetSecretsPort = vi.fn<() => Promise<void>>();
const cryptoSetSecretsPort = vi.fn<() => Promise<void>>();

vi.mock('../encryption-factory', () => ({
  getEncryptionWorker: () => ({
    setSecretsPort: (...args: unknown[]) =>
      encryptionSetSecretsPort(...args) as Promise<void>,
  }),
}));

vi.mock('../crypto-factory', () => ({
  getCryptoWorker: () => ({
    setSecretsPort: (...args: unknown[]) =>
      cryptoSetSecretsPort(...args) as Promise<void>,
  }),
}));

describe('secrets-channel', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    encryptionSetSecretsPort.mockResolvedValue(undefined);
    cryptoSetSecretsPort.mockResolvedValue(undefined);
    const { resetSecretsChannel } = await import('../secrets-channel');
    resetSecretsChannel();
  });

  it('ensureSecretsChannel retries after first setup failure', async () => {
    encryptionSetSecretsPort.mockRejectedValueOnce(
      new Error('port setup failed'),
    );

    const { ensureSecretsChannel } = await import('../secrets-channel');

    await expect(ensureSecretsChannel()).rejects.toThrow('port setup failed');

    await expect(ensureSecretsChannel()).resolves.toBeUndefined();
  });

  it('recovers after a setup failure and stays ready after successful retry', async () => {
    encryptionSetSecretsPort.mockRejectedValueOnce(
      new Error('port setup failed once'),
    );

    const { ensureSecretsChannel } = await import('../secrets-channel');

    await expect(ensureSecretsChannel()).rejects.toThrow(
      'Failed to establish secrets channel: port setup failed once',
    );
    await expect(ensureSecretsChannel()).resolves.toBeUndefined();
    await expect(ensureSecretsChannel()).resolves.toBeUndefined();

    expect(encryptionSetSecretsPort).toHaveBeenCalledTimes(2);
    expect(cryptoSetSecretsPort).toHaveBeenCalledTimes(2);
  });

  it('ensureSecretsChannel throws contextual setup error', async () => {
    encryptionSetSecretsPort.mockRejectedValueOnce(
      new Error('port setup failed'),
    );

    const { ensureSecretsChannel } = await import('../secrets-channel');

    await expect(ensureSecretsChannel()).rejects.toThrow(
      'Failed to establish secrets channel: port setup failed',
    );
  });
});
