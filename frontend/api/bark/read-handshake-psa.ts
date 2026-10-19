import http2 from 'node:http2'

/** Second's public Ark servers. Native gRPC handshake carries the public notice. */
export const BARK_PUBLIC_SERVER_ORIGINS = {
  signet: 'https://ark.signet.2nd.dev',
  mainnet: 'https://ark.second.tech',
} as const

export type BarkPublicServerNetwork = keyof typeof BARK_PUBLIC_SERVER_ORIGINS

const HANDSHAKE_PATH = '/bark_server.ArkService/Handshake'
const HANDSHAKE_TIMEOUT_MS = 8_000

/** A handshake public notice fits well under this. Larger bodies are dropped. */
export const HANDSHAKE_RESPONSE_BODY_CAP_BYTES = 64 * 1024

/** Must stay equal to `bark-wallet` in `bitboard-bark/Cargo.toml`. */
export const BARK_HANDSHAKE_CLIENT_VERSION = '0.7.1'

const PROTOBUF_WIRE_TYPE_VARINT = 0
const PROTOBUF_WIRE_TYPE_FIXED64 = 1
const PROTOBUF_WIRE_TYPE_LENGTH_DELIMITED = 2
const PROTOBUF_WIRE_TYPE_FIXED32 = 5
const PROTOBUF_WIRE_TYPE_MASK = 7
const PROTOBUF_FIELD_NUMBER_SHIFT = 3
const PROTOBUF_VARINT_CONTINUATION = 0x80
const PROTOBUF_VARINT_VALUE_MASK = 0x7f

/** HandshakeRequest.version is field 1. HandshakeResponse.psa is field 3. */
const HANDSHAKE_VERSION_FIELD_NUMBER = 1
const PSA_FIELD_NUMBER = 3
const HANDSHAKE_VERSION_FIELD_TAG =
  (HANDSHAKE_VERSION_FIELD_NUMBER << PROTOBUF_FIELD_NUMBER_SHIFT) | PROTOBUF_WIRE_TYPE_LENGTH_DELIMITED

export function encodeHandshakeRequestFrame(barkVersion: string): Buffer {
  const versionBytes = Buffer.from(barkVersion, 'utf8')
  const message = Buffer.alloc(2 + versionBytes.length)
  message[0] = HANDSHAKE_VERSION_FIELD_TAG
  message[1] = versionBytes.length
  versionBytes.copy(message, 2)
  const frame = Buffer.alloc(5 + message.length)
  frame[0] = 0
  frame.writeUInt32BE(message.length, 1)
  message.copy(frame, 5)
  return frame
}

/**
 * Public-service string from a HandshakeResponse gRPC body.
 * Returns null when the bytes are not a handshake data frame.
 */
export function readHandshakePsaFromGrpcFrames(body: Uint8Array): string | null {
  let offset = 0
  let publicNotice: string | null = null
  while (offset + 5 <= body.length) {
    const compressedFlag = body[offset] ?? 0
    const messageLength = readUint32Be(body, offset + 1)
    offset += 5
    if (messageLength == null || offset + messageLength > body.length) {
      return publicNotice
    }
    const message = body.subarray(offset, offset + messageLength)
    offset += messageLength
    if (compressedFlag !== 0) {
      continue
    }
    const notice = readProtobufStringField(message, PSA_FIELD_NUMBER)
    if (notice != null) {
      publicNotice = notice
    }
  }
  return publicNotice
}

/** Handshake the allowlisted Ark server and return its public notice, if any. */
export function readBarkHandshakePublicNotice(origin: string): Promise<string | null> {
  return new Promise((resolve) => {
    const client = http2.connect(origin)
    let settled = false
    const finish = (publicNotice: string | null) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      client.close()
      resolve(publicNotice)
    }
    const timer = setTimeout(() => {
      client.destroy()
      finish(null)
    }, HANDSHAKE_TIMEOUT_MS)

    client.on('error', () => finish(null))
    const request = client.request({
      ':method': 'POST',
      ':path': HANDSHAKE_PATH,
      'content-type': 'application/grpc',
      te: 'trailers',
      'x-user-agent': 'bitboard/server-notice',
    })
    const chunks: Buffer[] = []
    let receivedByteCount = 0
    request.on('data', (chunk: Buffer) => {
      if (settled) return
      const nextCount = pushHandshakeResponseChunk(chunks, receivedByteCount, chunk)
      if (nextCount == null) {
        finish(null)
        request.destroy()
        return
      }
      receivedByteCount = nextCount
    })
    request.on('error', () => finish(null))
    request.on('end', () => {
      finish(readHandshakePsaFromGrpcFrames(Buffer.concat(chunks)))
    })
    request.end(encodeHandshakeRequestFrame(BARK_HANDSHAKE_CLIENT_VERSION))
  })
}

/**
 * Appends one response chunk. Returns null when the body would pass the cap,
 * without storing that chunk.
 */
export function pushHandshakeResponseChunk(
  chunks: Buffer[],
  receivedByteCount: number,
  chunk: Buffer,
): number | null {
  const nextCount = receivedByteCount + chunk.length
  if (nextCount > HANDSHAKE_RESPONSE_BODY_CAP_BYTES) return null
  chunks.push(chunk)
  return nextCount
}

/**
 * Big-endian uint32. Bitwise shifts sign-extend in JavaScript, and a negative
 * frame length makes the handshake loop run without advancing.
 */
function readUint32Be(bytes: Uint8Array, offset: number): number | null {
  if (offset + 4 > bytes.length) return null
  return new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0, false)
}

function readProtobufStringField(message: Uint8Array, fieldNumber: number): string | null {
  let offset = 0
  let value: string | null = null
  while (offset < message.length) {
    const key = readVarint(message, offset)
    if (key == null) return value
    offset = key.offset
    const field = key.value >>> PROTOBUF_FIELD_NUMBER_SHIFT
    const wireType = key.value & PROTOBUF_WIRE_TYPE_MASK
    if (wireType === PROTOBUF_WIRE_TYPE_VARINT) {
      const skipped = readVarint(message, offset)
      if (skipped == null) return value
      offset = skipped.offset
      continue
    }
    if (wireType === PROTOBUF_WIRE_TYPE_FIXED64) {
      offset += 8
      continue
    }
    if (wireType === PROTOBUF_WIRE_TYPE_FIXED32) {
      offset += 4
      continue
    }
    if (wireType !== PROTOBUF_WIRE_TYPE_LENGTH_DELIMITED) return value
    const length = readVarint(message, offset)
    if (length == null) return value
    offset = length.offset
    const end = offset + length.value
    if (end > message.length) return value
    if (field === fieldNumber) {
      value = new TextDecoder().decode(message.subarray(offset, end))
    }
    offset = end
  }
  return value
}

/** Skips overlong varints. Callers that only need the byte offset can ignore `value`. */
function readVarint(
  bytes: Uint8Array,
  offset: number,
): { value: number; offset: number } | null {
  let value = 0
  let shift = 0
  let cursor = offset
  while (cursor < bytes.length && shift <= 28) {
    const byte = bytes[cursor] ?? 0
    cursor += 1
    value += (byte & PROTOBUF_VARINT_VALUE_MASK) * 2 ** shift
    if ((byte & PROTOBUF_VARINT_CONTINUATION) === 0) {
      return { value, offset: cursor }
    }
    shift += 7
  }
  while (cursor < bytes.length) {
    const byte = bytes[cursor] ?? 0
    cursor += 1
    if ((byte & PROTOBUF_VARINT_CONTINUATION) === 0) {
      return { value: 0, offset: cursor }
    }
  }
  return null
}
