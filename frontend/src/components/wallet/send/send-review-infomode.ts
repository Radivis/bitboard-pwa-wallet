export const SEND_REVIEW_INFOMODE = {
  amountToSend: {
    infoId: 'send-review-amount-to-send',
    infoTitle: 'Amount to send',
    infoText:
      'The payment that goes to the recipient’s address—not the mining fee. This is what they receive once the transaction confirms.',
  },
  feeRate: {
    infoId: 'send-review-fee-rate',
    infoTitle: 'Fee rate (sat/vB)',
    infoText:
      'The satoshis-per-virtual-byte rate you chose on the compose step. Miners prioritize by fee rate, but the actual fee below also depends on this transaction’s size (inputs and outputs).',
  },
  fee: {
    infoId: 'send-review-fee',
    infoTitle: 'Fee',
    infoText:
      'The mining fee for this specific transaction, taken from the built PSBT. It is roughly fee rate × size in virtual bytes—not the rate alone.',
  },
  totalDeducted: {
    infoId: 'send-review-total-deducted',
    infoTitle: 'Total deducted',
    infoText:
      'Everything this send takes from your wallet on-chain: the payment to the recipient plus the mining fee. Change is not subtracted here—it is sent back to you in the same transaction.',
  },
  balanceRemaining: {
    infoId: 'send-review-balance-remaining',
    infoTitle: 'Balance remaining',
    infoText:
      'Your estimated total wallet balance after this send: confirmed, pending, and immature funds combined, minus the payment and fee. This forecast can differ from “immediately spendable remaining,” which only counts confirmed coins not already used as inputs.',
  },
  change: {
    infoId: 'send-review-change',
    infoTitle: 'Change',
    infoText:
      'When your inputs total more than payment plus fee, the leftover is sent back to you as change—shown here as pending until the transaction confirms. Zero means the spend was change-free or no change output was created.',
  },
  immediatelySpendableRemaining: {
    infoId: 'send-review-immediately-spendable-remaining',
    infoTitle: 'Immediately spendable balance remaining',
    infoText:
      'Confirmed coins you could still spend right now after this transaction consumes its inputs: your spendable (settled) balance minus the value of the UTXOs listed below. Unconfirmed incoming or pending change elsewhere is not included.',
  },
  inputUtxosToggle: {
    infoId: 'send-review-input-utxos-toggle',
    infoTitle: 'UTXOs to be used',
    infoText:
      'The confirmed unspent outputs this transaction will spend from your wallet. Each row shows the source address and amount. Together they must cover the payment and fee; any excess becomes change.',
  },
} as const
