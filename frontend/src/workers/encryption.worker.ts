import { expose } from 'comlink'
import type { EncryptionService } from './encryption-api'
import { DEFAULT_KDF_PHC_FOR_DERIVE } from './encryption-api'
import type { EncryptedBlobMessage } from './secrets-channel-types'
import type { EncryptedBlob } from '@/lib/encrypted-blob-types'
import {
  ARGON2_KDF_PHC_CI,
  ARGON2_KDF_PHC_PRODUCTION,
} from '@/lib/kdf-phc-constants'

const SALT_LENGTH_BYTES = 16
const IV_LENGTH_BYTES = 12

function resolveCiArgon2Flag(): boolean {
  if (typeof import.meta.env === 'undefined') return false
  const ciFlagEnabled = import.meta.env.VITE_ARGON2_CI === '1'
  const isProductionBuild = import.meta.env.PROD === true
  if (ciFlagEnabled && isProductionBuild) {
    throw new Error(
      'Security guardrail: VITE_ARGON2_CI=1 is not allowed in production builds.',
    )
  }
  return ciFlagEnabled
}

/** CI params are allowed only outside production builds. */
const USE_CI_PARAMS = resolveCiArgon2Flag()

let wasm: typeof import('@/wasm-pkg/bitboard_encryption/bitboard_encryption') | null = null

async function getWasm() {
  if (!wasm) {
    wasm = await import('@/wasm-pkg/bitboard_encryption/bitboard_encryption')
  }
  return wasm
}

async function deriveKeyBytes(
  password: string,
  salt: Uint8Array,
  kdfPhc: string,
): Promise<Uint8Array> {
  const w = await getWasm()
  const key = w.deriveArgon2KeyFromPhc(password, salt, kdfPhc)
  return new Uint8Array(key)
}

async function deriveKey(
  password: string,
  salt: Uint8Array,
  kdfPhc: string,
): Promise<CryptoKey> {
  const rawKey = await deriveKeyBytes(password, salt, kdfPhc)
  try {
    return await crypto.subtle.importKey(
      'raw',
      rawKey as BufferSource,
      'AES-GCM',
      false,
      ['encrypt', 'decrypt'],
    )
  } finally {
    ;(rawKey as Uint8Array).fill(0)
  }
}

async function doEncrypt(password: string, plaintext: string): Promise<EncryptedBlob> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH_BYTES))
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH_BYTES))
  const kdfPhc = USE_CI_PARAMS ? ARGON2_KDF_PHC_CI : ARGON2_KDF_PHC_PRODUCTION
  const key = await deriveKey(password, salt, kdfPhc)
  const plaintextBytes = new TextEncoder().encode(plaintext)
  const ciphertextBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    plaintextBytes,
  )
  return {
    ciphertext: new Uint8Array(ciphertextBuffer),
    iv,
    salt,
    kdfPhc,
  }
}

async function doDecrypt(password: string, encrypted: EncryptedBlob): Promise<string> {
  const key = await deriveKey(password, encrypted.salt, encrypted.kdfPhc)
  try {
    const plaintextBytes = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: encrypted.iv as unknown as BufferSource },
      key,
      encrypted.ciphertext as unknown as BufferSource,
    )
    return new TextDecoder().decode(plaintextBytes)
  } catch {
    throw new Error('Decryption failed: incorrect password or corrupted data')
  }
}

/** API exposed on the secrets port for the crypto worker (Comlink RPC). */
const secretsChannelService = {
  async decrypt(password: string, encryptedBlob: EncryptedBlobMessage): Promise<string> {
    return doDecrypt(password, {
      ciphertext: encryptedBlob.ciphertext as Uint8Array,
      iv: encryptedBlob.iv as Uint8Array,
      salt: encryptedBlob.salt as Uint8Array,
      kdfPhc: encryptedBlob.kdfPhc,
    })
  },
  async encrypt(password: string, plaintext: string): Promise<EncryptedBlobMessage> {
    const blob = await doEncrypt(password, plaintext)
    return {
      ciphertext: blob.ciphertext,
      iv: blob.iv,
      salt: blob.salt,
      kdfPhc: blob.kdfPhc,
    }
  },
}

const encryptionService: EncryptionService = {
  async setSecretsPort(port: MessagePort): Promise<void> {
    expose(secretsChannelService, port)
    port.start()
  },

  async deriveKeyBytes(
    password: string,
    salt: Uint8Array,
    kdfPhc: string = DEFAULT_KDF_PHC_FOR_DERIVE,
  ): Promise<Uint8Array> {
    return deriveKeyBytes(password, salt, kdfPhc)
  },

  async encryptData(password: string, plaintext: string): Promise<EncryptedBlob> {
    return doEncrypt(password, plaintext)
  },

  async decryptData(password: string, encrypted: EncryptedBlob): Promise<string> {
    return doDecrypt(password, encrypted)
  },
}

expose(encryptionService)
