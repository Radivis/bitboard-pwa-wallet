import 'fake-indexeddb/auto'
import { beforeEach, afterAll, describe, expect, it } from 'vitest'
import { BitboardDatabase } from '../database'
import type { Wallet } from '../models'

describe('BitboardDatabase', () => {
  const db = new BitboardDatabase()

  beforeEach(async () => {
    await db.wallets.clear()
    await db.settings.clear()
  })

  afterAll(async () => {
    await db.delete()
  })

  describe('wallets table', () => {
    function createWallet(overrides: Partial<Omit<Wallet, 'id'>> = {}): Wallet {
      return {
        name: 'My Test Wallet',
        createdAt: new Date(),
        network: 'signet',
        ...overrides,
      } as Wallet
    }

    it('adds a wallet and retrieves it by id', async () => {
      const id = await db.wallets.add(createWallet())

      const retrieved = await db.wallets.get(id)

      expect(retrieved).toBeDefined()
      expect(retrieved!.name).toBe('My Test Wallet')
      expect(retrieved!.network).toBe('signet')
    })

    it('lists all wallets', async () => {
      await db.wallets.add(createWallet({ name: 'First Wallet' }))
      await db.wallets.add(createWallet({ name: 'Second Wallet', network: 'mainnet' }))

      const all = await db.wallets.toArray()

      expect(all).toHaveLength(2)
    })

    it('filters wallets by network', async () => {
      await db.wallets.add(createWallet({ name: 'Signet Wallet' }))
      await db.wallets.add(createWallet({ name: 'Mainnet Wallet', network: 'mainnet' }))
      await db.wallets.add(createWallet({ name: 'Another Signet' }))

      const signetWallets = await db.wallets.where('network').equals('signet').toArray()

      expect(signetWallets).toHaveLength(2)
      expect(signetWallets.every((w) => w.network === 'signet')).toBe(true)
    })

    it('updates a wallet', async () => {
      const id = await db.wallets.add(createWallet())

      await db.wallets.update(id, { name: 'Renamed Wallet' })
      const updated = await db.wallets.get(id)

      expect(updated!.name).toBe('Renamed Wallet')
      expect(updated!.network).toBe('signet')
    })

    it('deletes a wallet', async () => {
      const id = await db.wallets.add(createWallet())

      await db.wallets.delete(id)
      const deleted = await db.wallets.get(id)

      expect(deleted).toBeUndefined()
    })
  })

  describe('settings table', () => {
    it('stores and retrieves a setting by key', async () => {
      await db.settings.put({ key: 'theme-storage', value: '{"themeMode":"dark"}' })

      const setting = await db.settings.get('theme-storage')

      expect(setting).toBeDefined()
      expect(setting!.value).toBe('{"themeMode":"dark"}')
    })

    it('upserts a setting with put', async () => {
      await db.settings.put({ key: 'app-version', value: '0.1.0' })
      await db.settings.put({ key: 'app-version', value: '0.2.0' })

      const setting = await db.settings.get('app-version')

      expect(setting!.value).toBe('0.2.0')
    })

    it('deletes a setting', async () => {
      await db.settings.put({ key: 'temp-key', value: 'temp-value' })

      await db.settings.delete('temp-key')
      const deleted = await db.settings.get('temp-key')

      expect(deleted).toBeUndefined()
    })

    it('returns undefined for a non-existent key', async () => {
      const missing = await db.settings.get('does-not-exist')

      expect(missing).toBeUndefined()
    })
  })
})
