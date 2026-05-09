import { create } from 'zustand'
import type { BitcoinDisplayUnit } from '@/lib/bitcoin-display-unit'
import {
  NON_ESPLORA_FEE_PRESET_RATES_SAT_PER_VB,
  type SendFeePresetLabel,
} from '@/lib/esplora-fee-estimates'
import { useBitcoinDisplayUnitStore } from '@/stores/bitcoinDisplayUnitStore'

/** Session-local unit for the Send amount field (not persisted). */
export type SendAmountUnit = BitcoinDisplayUnit

export type SendStep = 1 | 2

/** At least one flag is true; both can apply when the user entered a sub-dust amount that also needed a change-free bump after clamping. */
export type OnchainDustWarning = {
  previousSats: number
  raisedToDustMin: boolean
  bumpedChangeFree: boolean
}

interface SendState {
  step: SendStep
  recipient: string
  amount: string
  amountUnit: SendAmountUnit
  feePresetSelection: SendFeePresetLabel
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
  setFeePresetSelection: (preset: SendFeePresetLabel) => void
  setFeeRate: (rate: number) => void
  setCustomFeeRate: (rate: string) => void
  setUseCustomFee: (use: boolean) => void
  setPsbt: (psbt: string | null) => void
  setOnchainDustWarning: (w: OnchainDustWarning | null) => void

  /** Reset form and step to initial state (e.g. after successful send or when leaving send page). */
  reset: () => void
}

const initialFeePresetSelection: SendFeePresetLabel = 'Medium'

const initialState = {
  step: 1 as SendStep,
  recipient: '',
  amount: '',
  amountUnit: 'BTC' as SendAmountUnit,
  feePresetSelection: initialFeePresetSelection,
  feeRate: NON_ESPLORA_FEE_PRESET_RATES_SAT_PER_VB[initialFeePresetSelection],
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
  setFeePresetSelection: (feePresetSelection) => set({ feePresetSelection }),
  setFeeRate: (feeRate) => set({ feeRate }),
  setCustomFeeRate: (customFeeRate) => set({ customFeeRate }),
  setUseCustomFee: (useCustomFee) => set({ useCustomFee }),
  setPsbt: (psbt) => set({ psbt }),
  setOnchainDustWarning: (onchainDustWarning) => set({ onchainDustWarning }),

  reset: () =>
    set({
      ...initialState,
      amountUnit: useBitcoinDisplayUnitStore.getState().defaultBitcoinUnit,
    }),
}))
