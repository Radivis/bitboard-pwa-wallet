/**
 * Canonical tag ids for library articles. Labels are shown in the UI.
 * Extend this map as new topics are covered.
 */
export const LIBRARY_TAGS = {
  cryptocurrencies: { label: 'Cryptocurrencies' },
  'decentralized-networks': { label: 'Decentralized networks / peer to peer' },
  blockchain: { label: 'Blockchain' },
  bitcoin: { label: 'Bitcoin' },
  lightning: { label: 'Lightning' },
  l2: { label: 'L2' },
  cryptography: { label: 'Cryptography' },
  'elliptic-curves': { label: 'Elliptic curves' },
  'quantum-computing': { label: 'Quantum computing' },
  security: { label: 'Security' },
  'test-networks': { label: 'Test networks' },
  history: { label: 'History' },
  'soft-forks': { label: 'Soft forks' },
  'hard-forks': { label: 'Hard forks' },
  standards: { label: 'Standards (BIPs, BOLTs)' },
  multisig: { label: 'Multisig' },
  wallets: { label: 'Wallets' },
  mining: { label: 'Mining' },
  hardware: { label: 'Hardware (signers, …)' },
  backups: { label: 'Backups' },
  nostr: { label: 'Nostr' },
} as const

export type LibraryTagId = keyof typeof LIBRARY_TAGS

export function isLibraryTagId(value: string): value is LibraryTagId {
  return value in LIBRARY_TAGS
}

export function getTagLabel(tagId: LibraryTagId): string {
  return LIBRARY_TAGS[tagId].label
}

/** All tag ids, sorted alphabetically by display label (for Tags page sections). */
export function listLibraryTagIdsSortedByLabel(): LibraryTagId[] {
  return (Object.keys(LIBRARY_TAGS) as LibraryTagId[]).sort((a, b) =>
    getTagLabel(a).localeCompare(getTagLabel(b)),
  )
}
