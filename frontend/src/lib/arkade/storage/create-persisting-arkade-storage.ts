import {
  InMemoryContractRepository,
  InMemoryWalletRepository,
} from '@arkade-os/sdk'
import {
  importBitboardArkadeSdkPersistence,
  parseBitboardArkadeSdkPersistenceJson,
  wrapContractRepositoryForPersistence,
  wrapWalletRepositoryForPersistence,
} from '@/lib/arkade/storage/arkade-in-memory-repo-snapshot'

/**
 * In-memory Arkade SDK storage with automatic persistence to encrypted wallet secrets.
 *
 * There is only **one** pair of repository instances. The "inner" and outer handles refer to
 * the same objects:
 *
 * - **innerWalletRepository / innerContractRepository** — plain `InMemory*Repository`
 *   instances. Use for hydrate/import and for `exportBitboardArkadeSdkPersistence` (flush
 *   reads repo maps via a direct field cast, not through the proxy).
 * - **walletRepository / contractRepository** — proxies around the same inner instances.
 *   Pass these to `Wallet.create` so SDK mutating calls schedule a debounced flush to
 *   `sdkPersistenceJson`.
 *
 * See `arkade.worker.ts` `openSession` for wiring. Critical RPCs also call
 * `flushSdkPersistenceNow()` explicitly.
 */
export interface PersistingArkadeStorageBundle {
  /** Proxy around {@link PersistingArkadeStorageBundle.innerWalletRepository} for `Wallet.create`. */
  walletRepository: InMemoryWalletRepository
  /** Proxy around {@link PersistingArkadeStorageBundle.innerContractRepository} for `Wallet.create`. */
  contractRepository: InMemoryContractRepository
  /** Concrete repo; same data as {@link PersistingArkadeStorageBundle.walletRepository}. */
  innerWalletRepository: InMemoryWalletRepository
  /** Concrete repo; same data as {@link PersistingArkadeStorageBundle.contractRepository}. */
  innerContractRepository: InMemoryContractRepository
}

/** Hydrates from optional `sdkPersistenceJson`, then returns inner + proxied repo handles. */
export function createPersistingArkadeStorage(
  sdkPersistenceJson?: string,
): PersistingArkadeStorageBundle {
  const innerWalletRepository = new InMemoryWalletRepository()
  const innerContractRepository = new InMemoryContractRepository()

  if (sdkPersistenceJson != null && sdkPersistenceJson.trim().length > 0) {
    const persistence = parseBitboardArkadeSdkPersistenceJson(sdkPersistenceJson)
    importBitboardArkadeSdkPersistence({
      walletRepository: innerWalletRepository,
      contractRepository: innerContractRepository,
      persistence,
    })
  }

  return {
    innerWalletRepository,
    innerContractRepository,
    walletRepository: wrapWalletRepositoryForPersistence(innerWalletRepository),
    contractRepository: wrapContractRepositoryForPersistence(innerContractRepository),
  }
}
