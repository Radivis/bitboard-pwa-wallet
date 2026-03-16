import { expose } from 'comlink';
import type { EncryptionService, EncryptedBlob } from './encryption-api';

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
  return crypto.subtle.importKey(
    'raw',
    rawKey,
    'AES-GCM',
    false,
    ['encrypt', 'decrypt']
  );
}

const encryptionService: EncryptionService = {
  async deriveKeyBytes(password: string, salt: Uint8Array): Promise<Uint8Array> {
    return deriveKeyBytes(password, salt);
  },

  async encryptData(password: string, plaintext: string): Promise<EncryptedBlob> {
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
  },

  async decryptData(password: string, encrypted: EncryptedBlob): Promise<string> {
    const key = await deriveKey(password, encrypted.salt);
    try {
      const plaintextBytes = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: encrypted.iv },
        key,
        encrypted.ciphertext
      );
      return new TextDecoder().decode(plaintextBytes);
    } catch {
      throw new Error('Decryption failed: incorrect password or corrupted data');
    }
  },
};

expose(encryptionService);
