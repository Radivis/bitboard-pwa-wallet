import { expose } from 'comlink';
import type { EncryptionService, EncryptedBlob } from './encryption-api';
import type { EncryptedBlobMessage } from './secrets-channel-types';

const SALT_LENGTH_BYTES = 16
const IV_LENGTH_BYTES = 12

let wasm: typeof import('@/wasm-pkg/bitboard_encryption/bitboard_encryption') | null = null;

async function getWasm() {
  if (!wasm) {
    wasm = await import('@/wasm-pkg/bitboard_encryption/bitboard_encryption');
  }
  return wasm;
}

async function deriveKeyBytes(password: string, salt: Uint8Array): Promise<Uint8Array> {
  const w = await getWasm();
  return new Uint8Array(w.derive_argon2_key(password, salt));
}

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const rawKey = await deriveKeyBytes(password, salt);
  try {
    return await crypto.subtle.importKey(
      'raw',
      rawKey as BufferSource,
      'AES-GCM',
      false,
      ['encrypt', 'decrypt']
    );
  } finally {
    (rawKey as Uint8Array).fill(0);
    // Note: Web Crypto may keep internal copies of the key; zeroing rawKey only
    // clears our buffer, not necessarily all in-process copies.
  }
}

async function doEncrypt(password: string, plaintext: string): Promise<EncryptedBlob> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH_BYTES));
  const key = await deriveKey(password, salt);
  const plaintextBytes = new TextEncoder().encode(plaintext);
  const ciphertextBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    plaintextBytes
  );
  return {
    ciphertext: new Uint8Array(ciphertextBuffer),
    iv,
    salt,
  };
}

async function doDecrypt(password: string, encrypted: EncryptedBlob): Promise<string> {
  const key = await deriveKey(password, encrypted.salt);
  try {
    const plaintextBytes = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: encrypted.iv as unknown as BufferSource },
      key,
      encrypted.ciphertext as unknown as BufferSource
    );
    return new TextDecoder().decode(plaintextBytes);
  } catch {
    throw new Error('Decryption failed: incorrect password or corrupted data');
  }
}

/** API exposed on the secrets port for the crypto worker (Comlink RPC). */
const secretsChannelService = {
  async decrypt(password: string, encryptedBlob: EncryptedBlobMessage): Promise<string> {
    return doDecrypt(password, {
      ciphertext: encryptedBlob.ciphertext as Uint8Array,
      iv: encryptedBlob.iv as Uint8Array,
      salt: encryptedBlob.salt as Uint8Array,
    });
  },
  async encrypt(password: string, plaintext: string): Promise<EncryptedBlobMessage> {
    const blob = await doEncrypt(password, plaintext);
    return { ciphertext: blob.ciphertext, iv: blob.iv, salt: blob.salt };
  },
};

const encryptionService: EncryptionService = {
  async setSecretsPort(port: MessagePort): Promise<void> {
    expose(secretsChannelService, port);
    port.start();
  },

  async deriveKeyBytes(password: string, salt: Uint8Array): Promise<Uint8Array> {
    return deriveKeyBytes(password, salt);
  },

  async encryptData(password: string, plaintext: string): Promise<EncryptedBlob> {
    return doEncrypt(password, plaintext);
  },

  async decryptData(password: string, encrypted: EncryptedBlob): Promise<string> {
    return doDecrypt(password, encrypted);
  },
};

expose(encryptionService);
