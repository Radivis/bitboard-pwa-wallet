import type { ArkadeSignerMigrationResult } from '@/workers/arkade-api'

export function arkadeSignerMigrationMigratedVtxoCount(
  result: ArkadeSignerMigrationResult,
): number {
  return result.vtxoLeg.migratedCount + result.boardingLeg.migratedCount
}

export function arkadeSignerMigrationMigratedSats(
  result: ArkadeSignerMigrationResult,
): number {
  return result.vtxoLeg.migratedSats + result.boardingLeg.migratedSats
}

export function arkadeSignerMigrationOversizedVtxoCount(
  result: ArkadeSignerMigrationResult,
): number {
  return result.vtxoLeg.oversizedCount + result.boardingLeg.oversizedCount
}

export function formatSignerMigrationPartialStatus(
  result: ArkadeSignerMigrationResult,
): string {
  const migratedCount = arkadeSignerMigrationMigratedVtxoCount(result)
  const migratedSats = arkadeSignerMigrationMigratedSats(result)
  const remainingParts: string[] = []

  if (result.remainingPreCutoffVtxoCount > 0) {
    remainingParts.push(
      `${result.remainingPreCutoffVtxoCount} VTXO${result.remainingPreCutoffVtxoCount === 1 ? '' : 's'} (${result.remainingPreCutoffSats} sats)`,
    )
  }
  if (result.remainingPreCutoffBoardingCount > 0) {
    remainingParts.push(
      `${result.remainingPreCutoffBoardingCount} boarding output${result.remainingPreCutoffBoardingCount === 1 ? '' : 's'}`,
    )
  }

  const oversizedCount = arkadeSignerMigrationOversizedVtxoCount(result)
  const oversizedNote =
    oversizedCount > 0
      ? ` ${oversizedCount} VTXO${oversizedCount === 1 ? '' : 's'} exceed the operator batch limit and require unilateral exit in Management.`
      : ''

  const passCapNote = result.passCapReached
    ? ' This Migrate action reached the per-click pass limit — tap Migrate again to continue.'
    : ''

  if (migratedCount > 0) {
    return `Migrated ${migratedCount} output${migratedCount === 1 ? '' : 's'} (${migratedSats} sats). ${remainingParts.join(' and ')} still need migration — tap Migrate again.${passCapNote}${oversizedNote}`
  }

  return `${remainingParts.join(' and ')} still need migration — tap Migrate again.${passCapNote}${oversizedNote}`
}
