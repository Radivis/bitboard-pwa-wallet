import { expose } from 'comlink';
import type { EncryptionService, EncryptedBlob } from './encryption-api';
import type {
  SecretsChannelDecryptRequest,
  SecretsChannelEncryptRequest,
  SecretsChannelResponse,
} from './secrets-channel-types';

const SALT_LENGTH_BYTES = 16
const IV_LENGTH_BYTES = 12

let wasm: typeof import('@/wasm-pkg/bitboard_encryption/bitboard_encryption') | null = null;
let secretsPort: MessagePort | null = null;

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

function handleSecretsPortMessage(event: MessageEvent<SecretsChannelDecryptRequest | SecretsChannelEncryptRequest>) {
  const msg = event.data;
  if (!msg || !secretsPort) return;

  if (msg.type === 'DECRYPT') {
    const { requestId, password, encryptedBlob } = msg;
    doDecrypt(password, {
      ciphertext: encryptedBlob.ciphertext as Uint8Array,
      iv: encryptedBlob.iv as Uint8Array,
      salt: encryptedBlob.salt as Uint8Array,
    })
      .then((plaintext) => {
        secretsPort!.postMessage({ type: 'DECRYPT_RESULT', requestId, plaintext } satisfies SecretsChannelResponse);
      })
      .catch((err) => {
        secretsPort!.postMessage({ type: 'DECRYPT_ERROR', requestId, error: String(err) } satisfies SecretsChannelResponse);
      });
    return;
  }

  if (msg.type === 'ENCRYPT') {
    const { requestId, password, plaintext } = msg;
    doEncrypt(password, plaintext)
      .then((encryptedBlob) => {
        secretsPort!.postMessage({
          type: 'ENCRYPT_RESULT',
          requestId,
          encryptedBlob: {
            ciphertext: encryptedBlob.ciphertext,
            iv: encryptedBlob.iv,
            salt: encryptedBlob.salt,
          },
        } satisfies SecretsChannelResponse);
      })
      .catch((err) => {
        secretsPort!.postMessage({ type: 'ENCRYPT_ERROR', requestId, error: String(err) } satisfies SecretsChannelResponse);
      });
  }
}

const encryptionService: EncryptionService = {
  async setSecretsPort(port: MessagePort): Promise<void> {
    if (secretsPort) {
      secretsPort.onmessage = null;
    }
    secretsPort = port;
    secretsPort.onmessage = handleSecretsPortMessage;
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
