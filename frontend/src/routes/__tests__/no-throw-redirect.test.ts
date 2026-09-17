import { describe, expect, it } from 'vitest'

const THROW_REDIRECT_LINE = /^\s*throw\s+redirect\s*\(/

const frontendSourceByPath = import.meta.glob(['../../**/*.ts', '../../**/*.tsx'], {
  query: '?raw',
  eager: true,
  import: 'default',
}) as Record<string, string>

function collectThrowRedirectHits(): string[] {
  const throwRedirectHits: string[] = []
  for (const [sourcePath, sourceText] of Object.entries(frontendSourceByPath)) {
    if (sourcePath.includes('/__tests__/')) continue
    if (sourcePath.endsWith('.test.ts') || sourcePath.endsWith('.test.tsx')) continue
    const sourceLines = sourceText.split('\n')
    sourceLines.forEach((sourceLine, lineIndex) => {
      if (THROW_REDIRECT_LINE.test(sourceLine)) {
        throwRedirectHits.push(`${sourcePath}:${lineIndex + 1}`)
      }
    })
  }
  return throwRedirectHits
}

describe('TanStack route redirects', () => {
  it('does not throw redirect() from frontend source', () => {
    expect(collectThrowRedirectHits()).toEqual([])
  })
})
