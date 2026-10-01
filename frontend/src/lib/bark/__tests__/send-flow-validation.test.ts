import { describe, expect, it } from 'vitest'
import { isValidArkadeAddress } from '@/lib/arkade/arkade-address'
import {
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
    expect(isBarkSendMode(true, reportedBarkReceiveAddress, false)).toBe(true)
    expect(
      isSendRecipientFormatValidWithBark({
        recipientFormatValidWithoutBark: false,
        barkAvailable: true,
        normalizedRecipient: reportedBarkReceiveAddress,
      }),
    ).toBe(true)
  })

  it('does not treat that address as valid when Bark is off', () => {
    expect(isBarkSendMode(false, reportedBarkReceiveAddress, false)).toBe(false)
    expect(
      isSendRecipientFormatValidWithBark({
        recipientFormatValidWithoutBark: false,
        barkAvailable: false,
        normalizedRecipient: reportedBarkReceiveAddress,
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
