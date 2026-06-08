import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { wrap, type Remote } from 'comlink'
import type { CryptoService } from '../crypto-api'
import {
  NO_ACTIVE_WALLET_WASM_MESSAGE,
  wasmCryptoErrorCode,
  wasmCryptoErrorMessage,
} from '@/lib/shared/wasm-crypto-error'

const comlinkExposePort = vi.hoisted(() => ({
  port: null as MessagePort | null,
}))

vi.mock('comlink', async (importOriginal) => {
  const actual = await importOriginal<typeof import('comlink')>()
  return {
    ...actual,
    expose: (
      target: unknown,
      endpoint?: MessagePort,
    ) => {
      const port = endpoint ?? comlinkExposePort.port
      if (port == null) {
        throw new Error('Comlink expose port not configured for integration test')
      }
      return actual.expose(target, port)
    },
  }
})

/**
 * Comlink + WASM in the crypto worker module (MessageChannel stands in for a Worker thread).
 * Verifies structured errors survive the same serialization path as production Comlink calls.
 */
describe('crypto worker WASM structured errors (integration)', () => {
  let cryptoWorkerProxy: Remote<CryptoService>
  let messageChannel: MessageChannel

  beforeEach(async () => {
    vi.resetModules()
    messageChannel = new MessageChannel()
    comlinkExposePort.port = messageChannel.port1

    await import('../crypto.worker')
    cryptoWorkerProxy = wrap<CryptoService>(messageChannel.port2)
  })

  afterEach(() => {
    messageChannel.port1.close()
    messageChannel.port2.close()
    comlinkExposePort.port = null
    vi.resetModules()
  })

  it('getNewAddress without loaded wallet returns no_active_wallet code via Comlink', async () => {
    let caught: unknown
    try {
      await cryptoWorkerProxy.getNewAddress()
    } catch (err) {
      caught = err
    }

    expect(wasmCryptoErrorCode(caught)).toBe('no_active_wallet')
  })

  it('openWalletSession returns a Comlink-serializable ephemeral session handle', async () => {
    const testMnemonic =
      'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'

    const createdWallet = await cryptoWorkerProxy.createWallet({
      mnemonic: testMnemonic,
      network: 'testnet',
      addressType: 'taproot',
      accountId: 0,
    })

    const session = await cryptoWorkerProxy.openWalletSession({
      externalDescriptor: createdWallet.externalDescriptor,
      internalDescriptor: createdWallet.internalDescriptor,
      network: 'testnet',
      changesetJson: createdWallet.changesetJson,
      useEmptyChain: false,
    })

    const balance = await session.getBalance()
    expect(balance.totalSats).toBe(0)
    session.free()
  })

  it('getBalance without loaded wallet returns no_active_wallet code via Comlink', async () => {
    let caught: unknown
    try {
      await cryptoWorkerProxy.getBalance()
    } catch (err) {
      caught = err
    }

    expect(caught).toBeDefined()
    expect(wasmCryptoErrorCode(caught)).toBe('no_active_wallet')
    expect(wasmCryptoErrorMessage(caught)).toContain('No active wallet')
    expect(wasmCryptoErrorMessage(caught)).toContain(NO_ACTIVE_WALLET_WASM_MESSAGE)
  })
})
