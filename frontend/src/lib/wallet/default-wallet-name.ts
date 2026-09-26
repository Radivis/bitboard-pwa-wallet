/** Stored name of the only wallet created when the device has none yet. */
export const FIRST_WALLET_DEFAULT_NAME = 'Main Wallet'

const HACKING_DRAGON_NAME_PREFIX = 'Hacking Dragon '

export const WALLET_NAME_ADJECTIVES = [
  'Clever',
  'Brave',
  'Swift',
  'Gentle',
  'Bright',
  'Calm',
  'Bold',
  'Happy',
  'Kind',
  'Lucky',
  'Noble',
  'Quick',
  'Curious',
  'Wise',
  'Friendly',
  'Responsible',
  'Proud',
  'Steady',
  'Smart',
  'Vigilant',
  'Jolly',
] as const

export const WALLET_NAME_ANIMALS = [
  'Fox',
  'Otter',
  'Hawk',
  'Dolphin',
  'Panda',
  'Wolf',
  'Lynx',
  'Heron',
  'Badger',
  'Falcon',
  'Koala',
  'Tiger',
  'Raven',
  'Whale',
  'Moose',
  'Bear',
  'Beaver',
  'Horse',
  'Swan',
  'Bison',
  'Dragon',
] as const

export function adjectiveAnimalWalletName(adjective: string, animal: string): string {
  return `${adjective} ${animal} Wallet`
}

/** Every adjective–animal label, including duplicates when an animal is listed twice. */
export function adjectiveAnimalWalletNames(): string[] {
  const names: string[] = []
  for (const adjective of WALLET_NAME_ADJECTIVES) {
    for (const animal of WALLET_NAME_ANIMALS) {
      names.push(adjectiveAnimalWalletName(adjective, animal))
    }
  }
  return names
}

function normalizedWalletName(walletName: string): string {
  return walletName.trim().toLowerCase()
}

function defaultRandomUnitInterval(): number {
  const randomBuffer = new Uint32Array(1)
  crypto.getRandomValues(randomBuffer)
  return randomBuffer[0]! / 0x1_0000_0000
}

function randomIndex(optionCount: number, randomUnitInterval: () => number): number {
  const unitInterval = randomUnitInterval()
  const index = Math.floor(unitInterval * optionCount)
  if (index >= optionCount) return optionCount - 1
  if (index < 0) return 0
  return index
}

function hackingDragonWalletName(sequenceNumber: number): string {
  return `${HACKING_DRAGON_NAME_PREFIX}${sequenceNumber}`
}

/**
 * Default label for a wallet that is about to be created.
 * The first wallet is "Main Wallet". Later wallets use an unused adjective–animal
 * name, then "Hacking Dragon {n}" once that pool is exhausted.
 */
export function suggestDefaultWalletName(
  existingWalletNames: readonly string[],
  randomUnitInterval: () => number = defaultRandomUnitInterval,
): string {
  if (existingWalletNames.length === 0) return FIRST_WALLET_DEFAULT_NAME

  const takenNames = new Set(existingWalletNames.map(normalizedWalletName))
  const availableNames = adjectiveAnimalWalletNames().filter(
    (walletName) => !takenNames.has(normalizedWalletName(walletName)),
  )
  const uniqueAvailableNames = [...new Set(availableNames)]
  if (uniqueAvailableNames.length > 0) {
    return uniqueAvailableNames[randomIndex(uniqueAvailableNames.length, randomUnitInterval)]!
  }

  let sequenceNumber = 1
  while (takenNames.has(normalizedWalletName(hackingDragonWalletName(sequenceNumber)))) {
    sequenceNumber += 1
  }
  return hackingDragonWalletName(sequenceNumber)
}
