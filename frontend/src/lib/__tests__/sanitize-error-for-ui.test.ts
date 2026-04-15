import { describe, expect, it } from 'vitest'
import { sanitizeErrorMessageForUi } from '@/lib/sanitize-error-for-ui'

describe('sanitizeErrorMessageForUi', () => {
  it('passes through short benign messages', () => {
    expect(sanitizeErrorMessageForUi('unit test error')).toBe('unit test error')
    expect(sanitizeErrorMessageForUi('sqlite failure')).toBe('sqlite failure')
  })

  it('replaces Unix-style absolute paths', () => {
    expect(
      sanitizeErrorMessageForUi('open failed /home/radivis/proj/db.sqlite'),
    ).toBe('open failed [path]')
  })

  it('replaces file URLs', () => {
    expect(
      sanitizeErrorMessageForUi('could not open file:///home/x/wallet.db'),
    ).toBe('could not open [file]')
  })

  it('replaces Windows paths', () => {
    expect(
      sanitizeErrorMessageForUi('failed C:\\Users\\me\\wallet.db'),
    ).toBe('failed [path]')
  })

  it('collapses whitespace', () => {
    expect(sanitizeErrorMessageForUi('a\n\n  b')).toBe('a b')
  })

  it('truncates very long messages', () => {
    const long = 'x'.repeat(400)
    const out = sanitizeErrorMessageForUi(long)
    expect(out.length).toBeLessThanOrEqual(320)
    expect(out.endsWith('…')).toBe(true)
  })
})
