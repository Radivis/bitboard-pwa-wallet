/** Pure SDK merge helpers — no main-thread decrypt. See arkade-payload-merge.ts. */
export {
  assertSdkPersistenceJsonWithinSizeLimit,
  mergeSdkPersistenceJsonMonotonic,
  readOffchainNextDerivationIndex,
} from '@/lib/arkade/arkade-payload-merge'
