import { getCryptoWorker } from '@/workers/crypto-factory'

export async function deriveKeyBytes(password: string, salt: Uint8Array): Promise<Uint8Array> {
  const worker = getCryptoWorker()
  return worker.deriveArgon2Key(password, salt)
}
