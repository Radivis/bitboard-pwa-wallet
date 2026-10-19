import { describe, expect, it } from 'vitest'
import { barkServerNoticeHttpResult } from '../../../../api/bark/server-notice-http'
import {
  BARK_HANDSHAKE_CLIENT_VERSION,
  encodeHandshakeRequestFrame,
  readHandshakePsaFromGrpcFrames,
} from '../../../../api/bark/read-handshake-psa'

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

  it('encodes the named Bark client version as protobuf field 1', () => {
    const frame = encodeHandshakeRequestFrame(BARK_HANDSHAKE_CLIENT_VERSION)
    const versionBytes = Buffer.from(BARK_HANDSHAKE_CLIENT_VERSION, 'utf8')
    expect(frame[5]).toBe(0x0a)
    expect(frame[6]).toBe(versionBytes.length)
    expect(frame.subarray(7, 7 + versionBytes.length).toString('utf8')).toBe(
      BARK_HANDSHAKE_CLIENT_VERSION,
    )
  })
})

describe('barkServerNoticeHttpResult', () => {
  it('answers options, a bad method, and a missing network without a handshake', async () => {
    await expect(barkServerNoticeHttpResult('OPTIONS', null)).resolves.toEqual({ status: 204 })
    await expect(barkServerNoticeHttpResult('POST', 'signet')).resolves.toEqual({
      status: 405,
      body: 'Method not allowed',
    })
    await expect(barkServerNoticeHttpResult('GET', null)).resolves.toEqual({
      status: 400,
      json: { psa: null },
    })
    await expect(barkServerNoticeHttpResult('GET', 'regtest')).resolves.toEqual({
      status: 400,
      json: { psa: null },
    })
  })
})
