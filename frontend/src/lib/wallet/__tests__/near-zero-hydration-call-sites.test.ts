import { describe, expect, it } from 'vitest'

const HYDRATE_NEAR_ZERO_SESSION_CALL = /hydrateNearZeroSessionForWalletRoute\s*\(/
const TRY_LOAD_NEAR_ZERO_SESSION_CALL = /tryLoadNearZeroSessionIntoMemory\s*\(/
const RESTORE_NEAR_ZERO_SESSION_FOR_OPERATION_CALL =
  /restoreNearZeroSecretsSessionForOperation\s*\(/

const frontendSourceByPath = import.meta.glob(['../../../**/*.ts', '../../../**/*.tsx'], {
  query: '?raw',
  eager: true,
  import: 'default',
}) as Record<string, string>

function toFrontendSrcRelativePath(globKey: string): string {
  const resolvedSegments: string[] = ['src', 'lib', 'wallet', '__tests__']
  for (const pathSegment of globKey.split('/')) {
    if (pathSegment === '.' || pathSegment === '') continue
    if (pathSegment === '..') {
      resolvedSegments.pop()
      continue
    }
    resolvedSegments.push(pathSegment)
  }
  const srcIndex = resolvedSegments.indexOf('src')
  return resolvedSegments.slice(srcIndex + 1).join('/')
}

function isProductionSourcePath(sourcePath: string): boolean {
  if (sourcePath.includes('/__tests__/')) return false
  if (sourcePath.endsWith('.test.ts') || sourcePath.endsWith('.test.tsx')) return false
  return true
}

function collectProductionCallSites(
  callPattern: RegExp,
  skipRelativePaths: string[],
): string[] {
  const callSites: string[] = []
  for (const [globKey, sourceText] of Object.entries(frontendSourceByPath)) {
    const relativePath = toFrontendSrcRelativePath(globKey)
    if (!isProductionSourcePath(relativePath)) continue
    if (skipRelativePaths.includes(relativePath)) continue
    if (callPattern.test(sourceText)) {
      callSites.push(relativePath)
    }
  }
  return callSites.sort()
}

describe('near-zero secrets-session operation call sites', () => {
  it('production hydrateNearZeroSessionForWalletRoute callers are only WalletUnlockOrNearZeroLoading', () => {
    expect(
      collectProductionCallSites(HYDRATE_NEAR_ZERO_SESSION_CALL, [
        'lib/wallet/near-zero-wallet-hydration.ts',
      ]),
    ).toEqual(['components/WalletUnlockOrNearZeroLoading.tsx'])
  })

  it('production tryLoadNearZeroSessionIntoMemory callers are only the operation helper', () => {
    expect(
      collectProductionCallSites(TRY_LOAD_NEAR_ZERO_SESSION_CALL, [
        'db/near-zero-security.ts',
      ]),
    ).toEqual(['lib/wallet/restore-near-zero-secrets-session.ts'])
  })

  it('production restoreNearZeroSecretsSessionForOperation callers are the documented operations', () => {
    expect(
      collectProductionCallSites(RESTORE_NEAR_ZERO_SESSION_FOR_OPERATION_CALL, [
        'lib/wallet/restore-near-zero-secrets-session.ts',
      ]),
    ).toEqual([
      'components/wallet/SeedPhraseBackup.tsx',
      'lib/wallet/near-zero-wallet-hydration.ts',
      'lib/wallet/require-unlocked-wallet.ts',
    ])
  })
})
