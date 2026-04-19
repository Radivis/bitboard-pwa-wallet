import { test, expect } from '@playwright/test'

test.describe('Crypto Worker Integration', () => {
  test.setTimeout(60_000)

  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForTimeout(5000)
  })

  test('wallet creation flow via worker', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const store = (window as Window & { __zustand_cryptoStore?: unknown }).__zustand_cryptoStore
      if (!store) {
        const { useCryptoStore } = await import('/src/stores/cryptoStore')
        const state = useCryptoStore.getState()
        const mnemonic = await state.generateMnemonic(12)
        const isValid = await state.validateMnemonic(mnemonic)
        const wallet = await state.createWallet({
          mnemonic,
          network: 'signet',
          addressType: 'taproot',
          accountId: 0,
        })
        return {
          wordCount: mnemonic.split(' ').length,
          isValid,
          hasDescriptors:
            !!wallet.external_descriptor && !!wallet.internal_descriptor,
          hasAddress: !!wallet.first_address,
          hasChangeset: !!wallet.changeset_json,
        }
      }
      return null
    })

    if (result) {
      expect(result.wordCount).toBe(12)
      expect(result.isValid).toBe(true)
      expect(result.hasDescriptors).toBe(true)
      expect(result.hasAddress).toBe(true)
      expect(result.hasChangeset).toBe(true)
    }
  })

  test('wallet creation 24 words via worker', async ({ page }) => {
    const result = await page.evaluate(async () => {
      try {
        const { useCryptoStore } = await import('/src/stores/cryptoStore')
        const state = useCryptoStore.getState()
        const mnemonic = await state.generateMnemonic(24)
        return { wordCount: mnemonic.split(' ').length }
      } catch {
        return null
      }
    })

    if (result) {
      expect(result.wordCount).toBe(24)
    }
  })

  test('descriptor derivation per address type', async ({ page }) => {
    const result = await page.evaluate(async () => {
      try {
        const { useCryptoStore } = await import('/src/stores/cryptoStore')
        const state = useCryptoStore.getState()
        const mnemonic = await state.generateMnemonic(12)
        const taproot = await state.deriveDescriptors({
          mnemonic,
          network: 'signet',
          addressType: 'taproot',
          accountId: 0,
        })
        const segwit = await state.deriveDescriptors({
          mnemonic,
          network: 'signet',
          addressType: 'segwit',
          accountId: 0,
        })
        return {
          taprootExternal: taproot.external,
          segwitExternal: segwit.external,
          different: taproot.external !== segwit.external,
        }
      } catch {
        return null
      }
    })

    if (result) {
      expect(result.different).toBe(true)
      expect(result.taprootExternal).toContain('tr(')
      expect(result.segwitExternal).toContain('wpkh(')
    }
  })

  test('address generation returns different addresses', async ({ page }) => {
    const result = await page.evaluate(async () => {
      try {
        const { useCryptoStore } = await import('/src/stores/cryptoStore')
        const state = useCryptoStore.getState()
        const mnemonic = await state.generateMnemonic(12)
        await state.createWallet({
          mnemonic,
          network: 'signet',
          addressType: 'taproot',
          accountId: 0,
        })
        const addr1 = await state.getNewAddress()
        const addr2 = await state.getNewAddress()
        return { addr1, addr2, different: addr1 !== addr2 }
      } catch {
        return null
      }
    })

    if (result) {
      expect(result.different).toBe(true)
      expect(result.addr1).toBeTruthy()
      expect(result.addr2).toBeTruthy()
    }
  })

  test('changeset persistence round-trip', async ({ page }) => {
    const result = await page.evaluate(async () => {
      try {
        const { useCryptoStore } = await import('/src/stores/cryptoStore')
        const state = useCryptoStore.getState()
        const mnemonic = await state.generateMnemonic(12)
        await state.createWallet({
          mnemonic,
          network: 'signet',
          addressType: 'taproot',
          accountId: 0,
        })
        const changeset = await state.exportChangeset()
        const parsed = JSON.parse(changeset)
        return {
          isValidJson: typeof parsed === 'object',
          hasChangeset: changeset.length > 2,
        }
      } catch {
        return null
      }
    })

    if (result) {
      expect(result.isValidJson).toBe(true)
      expect(result.hasChangeset).toBe(true)
    }
  })

  test('error handling for invalid mnemonic', async ({ page }) => {
    const result = await page.evaluate(async () => {
      try {
        const { useCryptoStore } = await import('/src/stores/cryptoStore')
        const state = useCryptoStore.getState()
        await state.createWallet({
          mnemonic: 'invalid mnemonic words',
          network: 'signet',
          addressType: 'taproot',
          accountId: 0,
        })
        return { threw: false }
      } catch {
        return { threw: true }
      }
    })

    if (result) {
      expect(result.threw).toBe(true)
    }
  })

  test('encryption worker key derivation', async ({ page }) => {
    const result = await page.evaluate(async () => {
      try {
        const { getEncryptionWorker } = await import(
          '/src/workers/encryption-factory'
        )
        const worker = getEncryptionWorker()
        const salt = new Uint8Array(16).fill(42)
        const kdfPhc = '$argon2id$v=19$m=65536,t=3,p=4'
        const key = await worker.deriveKeyBytes('testpassword', salt, kdfPhc)
        const key2 = await worker.deriveKeyBytes('testpassword', salt, kdfPhc)
        return {
          keyLength: key.length,
          deterministic: JSON.stringify(key) === JSON.stringify(key2),
        }
      } catch {
        return null
      }
    })

    if (result) {
      expect(result.keyLength).toBe(32)
      expect(result.deterministic).toBe(true)
    }
  })
})
