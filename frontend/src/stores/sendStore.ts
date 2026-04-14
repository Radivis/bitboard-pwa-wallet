import { create } from 'zustand'

export type SendAmountUnit = 'btc' | 'sats'

export type SendStep = 1 | 2

/** At least one flag is true; both can apply when the user entered a sub-dust amount that also needed a change-free bump after clamping. */
export type OnchainDustWarning = {
  previousSats: number
  raisedToMin546: boolean
  bumpedChangeFree: boolean
}

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
  /** Dust UX: show red warning below amount; cleared on manual amount edit or reset. */
  onchainDustWarning: OnchainDustWarning | null

  setStep: (step: SendStep) => void
  setRecipient: (recipient: string) => void
  /** Pass `{ fromUser: true }` when the user types in the field (clears dust warnings). */
  setAmount: (amount: string, opts?: { fromUser?: boolean }) => void
  setAmountUnit: (unit: SendAmountUnit) => void
  setFeeRate: (rate: number) => void
  setCustomFeeRate: (rate: string) => void
  setUseCustomFee: (use: boolean) => void
  setPsbt: (psbt: string | null) => void
  setOnchainDustWarning: (w: OnchainDustWarning | null) => void

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
  onchainDustWarning: null as OnchainDustWarning | null,
}

export const useSendStore = create<SendState>((set) => ({
  ...initialState,

  setStep: (step) => set({ step }),
  setRecipient: (recipient) => set({ recipient }),
  setAmount: (amount, opts) =>
    set((s) => ({
      amount,
      onchainDustWarning: opts?.fromUser === true ? null : s.onchainDustWarning,
    })),
  setAmountUnit: (amountUnit) => set({ amountUnit }),
  setFeeRate: (feeRate) => set({ feeRate }),
  setCustomFeeRate: (customFeeRate) => set({ customFeeRate }),
  setUseCustomFee: (useCustomFee) => set({ useCustomFee }),
  setPsbt: (psbt) => set({ psbt }),
  setOnchainDustWarning: (onchainDustWarning) => set({ onchainDustWarning }),

  reset: () => set(initialState),
}))
