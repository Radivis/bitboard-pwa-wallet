import { ensureMigrated, getDatabase } from '@/db'

/** Settings row key for ISO-8601 last app open (Infomode intro / reminder cadence). */
export const APP_SETTINGS_LAST_OPENED_AT_KEY = 'app_last_opened_at'

/**
 * Last time the app recorded a visit (ISO string in settings). Used for Infomode intro/reminder toasts.
 */
export async function getAppLastOpenedAt(): Promise<Date | null> {
  await ensureMigrated()
  const row = await getDatabase()
    .selectFrom('settings')
    .select('value')
    .where('key', '=', APP_SETTINGS_LAST_OPENED_AT_KEY)
    .executeTakeFirst()

  if (!row) {
    return null
  }
  const parsed = new Date(row.value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

/**
 * Persists “now” as the last app-open time (upsert). Call after evaluating hint logic so every visit advances the clock.
 */
export async function touchAppLastOpenedAt(isoTimestamp: string): Promise<void> {
  await ensureMigrated()
  await getDatabase()
    .insertInto('settings')
    .values({ key: APP_SETTINGS_LAST_OPENED_AT_KEY, value: isoTimestamp })
    .onConflict((oc) => oc.column('key').doUpdateSet({ value: isoTimestamp }))
    .execute()
}
