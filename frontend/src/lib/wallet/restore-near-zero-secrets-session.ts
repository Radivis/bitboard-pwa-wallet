import { getDatabase, tryLoadNearZeroSessionIntoMemory } from '@/db'

/**
 * Restores the near-zero wrap into the encryption worker for an operation that
 * needs a secrets session (decrypt `wallet_secrets` or load WASM from those secrets).
 *
 * Opening the app, Library, Lab browse, or Settings browse is not such an
 * operation and must not call this. Does not bootstrap WASM.
 */
export async function restoreNearZeroSecretsSessionForOperation(): Promise<boolean> {
  return tryLoadNearZeroSessionIntoMemory(getDatabase())
}
