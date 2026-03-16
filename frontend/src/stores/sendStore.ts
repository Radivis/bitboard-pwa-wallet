import { create } from 'zustand'

export type SendAmountUnit = 'btc' | 'sats'

export type SendStep = 1 | 2

interface SendState {
  step: SendStep
  recipient: string
  amount: string
  amountUnit: SendAmountUnit
  feeRate: number
  customFeeRate: string
  useCustomFee: boolean
  /** Base64-encoded PSBT (mainnet/testnet/signet/regtest); null for lab. */
  psbt: string | null

  setStep: (step: SendStep) => void
  setRecipient: (recipient: string) => void
  setAmount: (amount: string) => void
  setAmountUnit: (unit: SendAmountUnit) => void
  setFeeRate: (rate: number) => void
  setCustomFeeRate: (rate: string) => void
  setUseCustomFee: (use: boolean) => void
  setPsbt: (psbt: string | null) => void

  /** Reset form and step to initial state (e.g. after successful send or when leaving send page). */
  reset: () => void
}

const initialState = {
  step: 1 as SendStep,
  recipient: '',
  amount: '',
  amountUnit: 'btc' as SendAmountUnit,
  feeRate: 1,
  customFeeRate: '',
  useCustomFee: false,
  psbt: null as string | null,
}

export const useSendStore = create<SendState>((set) => ({
  ...initialState,

  setStep: (step) => set({ step }),
  setRecipient: (recipient) => set({ recipient }),
  setAmount: (amount) => set({ amount }),
  setAmountUnit: (amountUnit) => set({ amountUnit }),
  setFeeRate: (feeRate) => set({ feeRate }),
  setCustomFeeRate: (customFeeRate) => set({ customFeeRate }),
  setUseCustomFee: (useCustomFee) => set({ useCustomFee }),
  setPsbt: (psbt) => set({ psbt }),

  reset: () => set(initialState),
}))
