import { expose } from 'comlink';
import type { EncryptionService } from './encryption-api';

let wasm: typeof import('@/wasm-pkg/bitboard_encryption/bitboard_encryption') | null = null;

async function getWasm() {
  if (!wasm) {
    wasm = await import('@/wasm-pkg/bitboard_encryption/bitboard_encryption');
  }
  return wasm;
}

const encryptionService: EncryptionService = {
  async deriveKeyBytes(password: string, salt: Uint8Array): Promise<Uint8Array> {
    const w = await getWasm();
    return new Uint8Array(w.derive_argon2_key(password, salt));
  },
};

expose(encryptionService);
