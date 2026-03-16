/** Key derivation is delegated to the encryption worker (WASM in wasm-pkg/bitboard_encryption). */
import { getEncryptionWorker } from '@/workers/encryption-factory'

export async function deriveKeyBytes(password: string, salt: Uint8Array): Promise<Uint8Array> {
  const worker = getEncryptionWorker()
  return worker.deriveKeyBytes(password, salt)
}
