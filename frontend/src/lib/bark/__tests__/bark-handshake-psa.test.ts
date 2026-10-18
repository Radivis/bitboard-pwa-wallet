import { describe, expect, it } from 'vitest'
import { readHandshakePsaFromGrpcFrames } from '../../../../api/bark/read-handshake-psa'

describe('readHandshakePsaFromGrpcFrames', () => {
  it('reads the public notice from a native handshake frame', () => {
    const frame = Buffer.from(
      '000000002110ffffffffffffffffff011a14576527726520646f776e2c20736f7272792e2e2e',
      'hex',
    )
    expect(readHandshakePsaFromGrpcFrames(frame)).toBe("We're down, sorry...")
  })

  it('returns null for a non-grpc error page', () => {
    expect(readHandshakePsaFromGrpcFrames(Buffer.from('Internal Server Error'))).toBeNull()
  })
})
