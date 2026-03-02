import Dexie, { type Table } from 'dexie'
import type { Wallet, Setting } from './models'

const DATABASE_NAME = 'bitboard-wallet'
const DATABASE_VERSION = 1

export class BitboardDatabase extends Dexie {
  wallets!: Table<Wallet, number>
  settings!: Table<Setting, string>

  constructor() {
    super(DATABASE_NAME)

    this.version(DATABASE_VERSION).stores({
      wallets: '++id, name, network',
      settings: '&key',
    })
  }
}

export const db = new BitboardDatabase()
