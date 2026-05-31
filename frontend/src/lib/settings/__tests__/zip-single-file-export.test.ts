import { describe, expect, it } from 'vitest'
import { zipSingleFileForLocalExport } from '../zip-single-file-export'

describe('zipSingleFileForLocalExport', () => {
  it('returns a non-empty blob containing the entry name', async () => {
    const inner = new Blob(['hello'], { type: 'application/octet-stream' })
    const zipped = await zipSingleFileForLocalExport(inner, 'test.txt')
    expect(zipped).toBeInstanceOf(Blob)
    expect(zipped.size).toBeGreaterThan(0)
  })
})
