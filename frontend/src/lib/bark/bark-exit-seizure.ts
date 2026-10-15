const INVALID_EXIT_SEIZURES = 'Bark exit seizures are invalid'

export const BARK_EXIT_SEIZURE_WARNING =
  'The Bark operator spent an exit output on-chain outside this wallet. As a result, some of your VTXOs are now spent.'

/** Reads the JSON array from `bark_exit_seizures`. */
export function readBarkSeizedVtxoIds(value: unknown): string[] {
  if (typeof value !== 'string') {
    throw new Error(INVALID_EXIT_SEIZURES)
  }
  const parsed: unknown = JSON.parse(value)
  if (!Array.isArray(parsed) || parsed.some((id) => typeof id !== 'string' || id.length === 0)) {
    throw new Error(INVALID_EXIT_SEIZURES)
  }
  return parsed
}
