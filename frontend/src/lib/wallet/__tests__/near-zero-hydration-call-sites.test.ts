import { describe, expect, it } from 'vitest'

const HYDRATE_NEAR_ZERO_SESSION_CALL = /hydrateNearZeroSessionForWalletRoute\s*\(/

const frontendSourceByPath = import.meta.glob(['../../../**/*.ts', '../../../**/*.tsx'], {
  query: '?raw',
  eager: true,
  import: 'default',
}) as Record<string, string>

function collectProductionHydrateCallSites(): string[] {
  const hydrateCallSites: string[] = []
  for (const [sourcePath, sourceText] of Object.entries(frontendSourceByPath)) {
    if (sourcePath.includes('/__tests__/')) continue
    if (sourcePath.endsWith('.test.ts') || sourcePath.endsWith('.test.tsx')) continue
    if (sourcePath.endsWith('/near-zero-wallet-hydration.ts')) continue
    if (HYDRATE_NEAR_ZERO_SESSION_CALL.test(sourceText)) {
      hydrateCallSites.push(sourcePath)
    }
  }
  return hydrateCallSites.sort()
}

describe('near-zero wallet hydration call sites', () => {
  it('production hydrateNearZeroSessionForWalletRoute callers are only WalletUnlockOrNearZeroLoading', () => {
    expect(collectProductionHydrateCallSites()).toEqual([
      '../../../components/WalletUnlockOrNearZeroLoading.tsx',
    ])
  })
})
