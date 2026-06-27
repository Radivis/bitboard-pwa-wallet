export const WALLET_WRITER_LOCK_NAME = 'bitboard-wallet-writer'
export const LAB_WRITER_LOCK_NAME = 'bitboard-lab-writer'

export type OpfsWriterLock = {
  withWriterLock: <T>(work: () => Promise<T>) => Promise<T>
  isWriterLockHeld: () => boolean
  resetForTests: () => void
}

export function createOpfsWriterLock(lockName: string): OpfsWriterLock {
  let holdDepth = 0
  let sameTabWriteChain: Promise<unknown> = Promise.resolve()

  function isWriterLockHeld(): boolean {
    return holdDepth > 0
  }

  function resetForTests(): void {
    holdDepth = 0
    sameTabWriteChain = Promise.resolve()
  }

  async function runWithHoldDepth<T>(work: () => Promise<T>): Promise<T> {
    holdDepth += 1
    try {
      return await work()
    } finally {
      holdDepth -= 1
    }
  }

  async function runExclusive<T>(work: () => Promise<T>): Promise<T> {
    if (holdDepth > 0) {
      return work()
    }

    const locks = globalThis.navigator?.locks
    if (locks == null) {
      return runWithHoldDepth(work)
    }

    return locks.request(lockName, { mode: 'exclusive' }, () => runWithHoldDepth(work))
  }

  async function withWriterLock<T>(work: () => Promise<T>): Promise<T> {
    if (holdDepth > 0) {
      return work()
    }

    const writeTurn = (async () => {
      try {
        await sameTabWriteChain
      } catch {
        // Prior same-tab write may have failed; the FIFO queue still advances.
      }
      return runExclusive(work)
    })()

    sameTabWriteChain = (async () => {
      try {
        await writeTurn
      } catch {
        // Keep the chain settled so later writers are not blocked.
      }
    })()

    return writeTurn
  }

  return { withWriterLock, isWriterLockHeld, resetForTests }
}

const walletWriterLock = createOpfsWriterLock(WALLET_WRITER_LOCK_NAME)
const labWriterLock = createOpfsWriterLock(LAB_WRITER_LOCK_NAME)

export const withWalletWriterLock = walletWriterLock.withWriterLock
export const isWalletWriterLockHeld = walletWriterLock.isWriterLockHeld
export const resetWalletWriterLockForTests = walletWriterLock.resetForTests

export const withLabWriterLock = labWriterLock.withWriterLock
export const isLabWriterLockHeld = labWriterLock.isWriterLockHeld
export const resetLabWriterLockForTests = labWriterLock.resetForTests
