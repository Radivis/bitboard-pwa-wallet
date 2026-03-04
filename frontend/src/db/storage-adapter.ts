import type { StateStorage } from 'zustand/middleware'
import { getDatabase, ensureMigrated } from './database'

export const sqliteStorage: StateStorage = {
  async getItem(key: string): Promise<string | null> {
    await ensureMigrated()
    const row = await getDatabase()
      .selectFrom('settings')
      .select('value')
      .where('key', '=', key)
      .executeTakeFirst()
    return row?.value ?? null
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
