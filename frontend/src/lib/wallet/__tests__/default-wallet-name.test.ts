import { describe, expect, it } from 'vitest'
import {
  FIRST_WALLET_DEFAULT_NAME,
  WALLET_NAME_ADJECTIVES,
  WALLET_NAME_ANIMALS,
  adjectiveAnimalWalletNames,
  suggestDefaultWalletName,
} from '@/lib/wallet/default-wallet-name'

const pickFirst = () => 0
const pickLast = () => 0.999999

describe('suggestDefaultWalletName', () => {
  it('names the first wallet Main Wallet', () => {
    expect(suggestDefaultWalletName([], pickLast)).toBe(FIRST_WALLET_DEFAULT_NAME)
    expect(FIRST_WALLET_DEFAULT_NAME).toBe('Main Wallet')
  })

  it('uses the fixed adjective and animal lists', () => {
    expect(WALLET_NAME_ADJECTIVES).toHaveLength(21)
    expect(WALLET_NAME_ANIMALS).toHaveLength(21)
    expect(adjectiveAnimalWalletNames()).toHaveLength(21 * 21)
  })

  it('picks an unused adjective-animal name and never a timestamp', () => {
    const walletName = suggestDefaultWalletName(['Main Wallet'], pickFirst)

    expect(walletName).toBe('Clever Fox Wallet')
    expect(walletName).not.toMatch(/\d/)
  })

  it('skips names that are already taken, ignoring case and surrounding spaces', () => {
    const walletName = suggestDefaultWalletName(
      ['Main Wallet', '  CLEVER FOX WALLET  '],
      pickFirst,
    )

    expect(walletName).toBe('Clever Otter Wallet')
  })

  it('can pick the last remaining adjective-animal name', () => {
    const takenNames = [...new Set(adjectiveAnimalWalletNames())]
    const lastAvailableName = takenNames.pop()!

    const walletName = suggestDefaultWalletName(['Main Wallet', ...takenNames], pickLast)

    expect(walletName).toBe(lastAvailableName)
  })

  it('continues with the smallest free Hacking Dragon number when every pair is taken', () => {
    const everyPair = [...new Set(adjectiveAnimalWalletNames())]

    expect(suggestDefaultWalletName(everyPair, pickFirst)).toBe('Hacking Dragon 1')
    expect(suggestDefaultWalletName([...everyPair, 'hacking dragon 1'], pickLast)).toBe(
      'Hacking Dragon 2',
    )
    expect(
      suggestDefaultWalletName(
        [...everyPair, 'Hacking Dragon 1', '  Hacking Dragon 2  '],
        pickFirst,
      ),
    ).toBe('Hacking Dragon 3')
  })
})
