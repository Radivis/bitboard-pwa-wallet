import { describe, expect, it, vi } from 'vitest'
import { isValidArkadeAddress } from '@/lib/arkade/arkade-address'
import {
  isBarkMainnetPolicyAddress,
  isBarkSendMode,
  isBarkSignetPolicyAddress,
  isSendRecipientFormatValidWithBark,
  sendRecipientFieldLabel,
} from '@/lib/bark/send-flow-validation'

/** Address shown on the Bark receive page that the send form used to reject. */
const reportedBarkReceiveAddress =
  'tark1pem36wcfzqqpfx70khldrqd863rjxgq9d26efp0j43rwfpskdvgmkp60d87h443fzqypec02q3nccdj3gajzj92rekcm8qaqvhmnn9m5rr2rgjp82xldkp6q8gx5p7'

describe('Bark receive addresses on the send form', () => {
  it('accepts the reported Signet Bark receive address when Bark is available', () => {
    expect(isBarkSignetPolicyAddress(reportedBarkReceiveAddress)).toBe(true)
    expect(isValidArkadeAddress(reportedBarkReceiveAddress)).toBe(false)
    expect(isBarkSendMode(true, reportedBarkReceiveAddress, false, 'signet')).toBe(true)
    expect(isBarkSendMode(true, reportedBarkReceiveAddress, false, 'mainnet')).toBe(false)
    expect(
      isSendRecipientFormatValidWithBark({
        recipientFormatValidWithoutBark: false,
        barkAvailable: true,
        normalizedRecipient: reportedBarkReceiveAddress,
        networkMode: 'signet',
      }),
    ).toBe(true)
  })

  it('accepts an ark1p address on mainnet and refuses it on signet', () => {
    const mainnetAddress = reportedBarkReceiveAddress.replace(/^tark1p/, 'ark1p')
    expect(isBarkMainnetPolicyAddress(mainnetAddress)).toBe(true)
    expect(isBarkSignetPolicyAddress(mainnetAddress)).toBe(false)
    expect(isBarkSendMode(true, mainnetAddress, false, 'mainnet')).toBe(true)
    expect(isBarkSendMode(true, mainnetAddress, false, 'signet')).toBe(false)
  })

  it('accepts a tark1p address on regtest only while the e2e flag is on', () => {
    expect(isBarkSendMode(true, reportedBarkReceiveAddress, false, 'regtest')).toBe(false)
    vi.stubEnv('VITE_E2E_BARK_REGTEST', 'true')
    expect(isBarkSendMode(true, reportedBarkReceiveAddress, false, 'regtest')).toBe(true)
    vi.unstubAllEnvs()
    expect(isBarkSendMode(true, reportedBarkReceiveAddress, false, 'regtest')).toBe(false)
  })

  it('does not treat that address as valid when Bark is off', () => {
    expect(isBarkSendMode(false, reportedBarkReceiveAddress, false, 'signet')).toBe(false)
    expect(
      isSendRecipientFormatValidWithBark({
        recipientFormatValidWithoutBark: false,
        barkAvailable: false,
        normalizedRecipient: reportedBarkReceiveAddress,
        networkMode: 'signet',
      }),
    ).toBe(false)
  })

  it('labels the field as a Bark address only in Bark mode', () => {
    expect(
      sendRecipientFieldLabel({
        isLightningSendMode: false,
        isBarkSendMode: true,
        isArkadeSendMode: false,
      }),
    ).toBe('Bark address')
  })
})
