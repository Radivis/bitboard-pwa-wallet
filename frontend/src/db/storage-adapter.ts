import type { StateStorage } from 'zustand/middleware'
import { getDatabase, ensureMigrated } from './database'

const WALLET_STORAGE_KEY = 'wallet-storage'

async function getItemRaw(key: string): Promise<string | null> {
  await ensureMigrated()
  const row = await getDatabase()
    .selectFrom('settings')
    .select('value')
    .where('key', '=', key)
    .executeTakeFirst()
  return row?.value ?? null
}

function migratePersonalRegtestToLab(value: string): string {
  try {
    const parsed = JSON.parse(value) as { state?: { networkMode?: string } }
    if (parsed?.state?.networkMode === 'personal-regtest') {
      parsed.state.networkMode = 'lab'
      return JSON.stringify(parsed)
    }
  } catch {
    // Ignore parse errors
  }
  return value
}

export const sqliteStorage: StateStorage = {
  async getItem(key: string): Promise<string | null> {
    const value = await getItemRaw(key)
    if (key === WALLET_STORAGE_KEY && value) {
      return migratePersonalRegtestToLab(value)
    }
    return value
  },

  async setItem(key: string, value: string): Promise<void> {
    await ensureMigrated()
    await getDatabase()
      .insertInto('settings')
      .values({ key, value })
      .onConflict((oc) => oc.column('key').doUpdateSet({ value }))
      .execute()
  },

  async removeItem(key: string): Promise<void> {
    await ensureMigrated()
    await getDatabase()
      .deleteFrom('settings')
      .where('key', '=', key)
      .execute()
  },
}
