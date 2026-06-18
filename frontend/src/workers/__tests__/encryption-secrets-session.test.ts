import { beforeEach, describe, expect, it } from 'vitest'
import {
  beginSecretsSession,
  endSecretsSession,
  isSecretsSessionActive,
  MSG_SECRETS_SESSION_ALREADY_ACTIVE,
  MSG_SECRETS_SESSION_IN_FLIGHT,
  MSG_SECRETS_SESSION_NOT_ACTIVE,
  withSessionPassword,
} from '@/workers/encryption-secrets-session'
import { createSecretsSessionChannelApi } from '@/workers/encryption-secrets-session-api'

describe('encryption-secrets-session', () => {
  beforeEach(() => {
    if (isSecretsSessionActive()) {
      endSecretsSession()
    }
  })

  it('beginSession enables decrypt and encrypt', async () => {
    const api = createSecretsSessionChannelApi(
      async (_password, _plaintext) => ({
        ciphertext: new Uint8Array([1]),
        iv: new Uint8Array([2]),
        salt: new Uint8Array([3]),
        kdfPhc: 'phc',
      }),
      async (password, encrypted) => `${password}:${encrypted.kdfPhc}`,
    )

    await api.beginSession('unlock-password')
    const decrypted = await api.decrypt({
      ciphertext: new Uint8Array([9]),
      iv: new Uint8Array([8]),
      salt: new Uint8Array([7]),
      kdfPhc: 'stored',
    })
    expect(decrypted).toBe('unlock-password:stored')

    const encrypted = await api.encrypt('payload-json')
    expect(encrypted.ciphertext).toEqual(new Uint8Array([1]))
  })

  it('decrypt without session throws stable error', async () => {
    const api = createSecretsSessionChannelApi(
      async () => ({
        ciphertext: new Uint8Array(),
        iv: new Uint8Array(),
        salt: new Uint8Array(),
        kdfPhc: 'phc',
      }),
      async () => 'ok',
    )

    await expect(
      api.decrypt({
        ciphertext: new Uint8Array([1]),
        iv: new Uint8Array([2]),
        salt: new Uint8Array([3]),
        kdfPhc: 'phc',
      }),
    ).rejects.toThrow(MSG_SECRETS_SESSION_NOT_ACTIVE)
  })

  it('endSession clears session', async () => {
    beginSecretsSession('pw')
    endSecretsSession()
    expect(isSecretsSessionActive()).toBe(false)
    await expect(withSessionPassword(async () => 'x')).rejects.toThrow(
      MSG_SECRETS_SESSION_NOT_ACTIVE,
    )
  })

  it('beginSession rejects when already active', () => {
    beginSecretsSession('pw')
    expect(() => beginSecretsSession('other')).toThrow(MSG_SECRETS_SESSION_ALREADY_ACTIVE)
    endSecretsSession()
  })

  it('endSession rejects while in-flight', async () => {
    beginSecretsSession('pw')
    let releaseInFlight: (() => void) | undefined
    const inFlight = new Promise<void>((resolve) => {
      releaseInFlight = resolve
    })

    const pending = withSessionPassword(async () => {
      await inFlight
      return 'done'
    })

    await expect(async () => endSecretsSession()).rejects.toThrow(MSG_SECRETS_SESSION_IN_FLIGHT)
    releaseInFlight!()
    await pending
    endSecretsSession()
  })
})
