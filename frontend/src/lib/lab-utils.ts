import type {
  LabTxRecord,
  LabTxDetails,
  MempoolEntry,
} from '@/workers/lab-api'
import type { TransactionDetails } from '@/workers/crypto-types'

export const WALLET_OWNER_PREFIX = 'wallet:'

export function labTransactionsForWallet(
  labState: {
    transactions: LabTxRecord[]
    txDetails: LabTxDetails[]
    mempool: MempoolEntry[]
  },
  activeWalletId: number,
): TransactionDetails[] {
  const walletOwner = `${WALLET_OWNER_PREFIX}${activeWalletId}`
  const txDetailsByTxid = new Map(
    labState.txDetails.map((d) => [d.txid, d]),
  )

  const result: TransactionDetails[] = []

  for (const entry of labState.mempool ?? []) {
    const isSender = entry.sender === walletOwner
    const isReceiver = entry.receiver === walletOwner
    if (!isSender && !isReceiver) continue

    const sentSats = isSender
      ? (entry.outputsDetail ?? [])
          .filter((o) => !o.isChange)
          .reduce((s, o) => s + o.amountSats, 0)
      : 0
    const receivedSats = isReceiver
      ? (entry.outputsDetail ?? [])
          .filter((o) => o.owner === walletOwner)
          .reduce((s, o) => s + o.amountSats, 0)
      : 0

    result.push({
      txid: entry.txid,
      sent_sats: sentSats,
      received_sats: receivedSats,
      fee_sats: entry.feeSats,
      confirmation_block_height: null,
      confirmation_time: null,
      is_confirmed: false,
    })
  }

  for (const record of labState.transactions ?? []) {
    const isSender = record.sender === walletOwner
    const isReceiver = record.receiver === walletOwner
    if (!isSender && !isReceiver) continue

    const details = txDetailsByTxid.get(record.txid)
    if (!details) continue

    const sentSats = isSender
      ? (details.outputs ?? []).filter((o) => !o.isChange).reduce((s, o) => s + o.amountSats, 0)
      : 0
    const receivedSats = isReceiver
      ? (details.outputs ?? [])
          .filter((o) => o.owner === walletOwner)
          .reduce((s, o) => s + o.amountSats, 0)
      : 0

    const totalInput = (details.inputs ?? []).reduce((s, i) => s + i.amountSats, 0)
    const totalOutput = (details.outputs ?? []).reduce((s, o) => s + o.amountSats, 0)
    const feeSats = totalInput - totalOutput

    result.push({
      txid: record.txid,
      sent_sats: sentSats,
      received_sats: receivedSats,
      fee_sats: feeSats,
      confirmation_block_height: details.blockHeight,
      confirmation_time: details.blockTime,
      is_confirmed: true,
    })
  }

  result.sort((a, b) => {
    if (!a.is_confirmed && b.is_confirmed) return -1
    if (a.is_confirmed && !b.is_confirmed) return 1
    if (a.is_confirmed && b.is_confirmed) {
      const timeA = a.confirmation_time ?? 0
      const timeB = b.confirmation_time ?? 0
      return timeB - timeA
    }
    return 0
  })

  return result
}

export function getOwnerDisplayName(
  ownerKey: string,
  wallets: { wallet_id: number; name: string }[],
): string {
  if (ownerKey.startsWith(WALLET_OWNER_PREFIX)) {
    const id = parseInt(ownerKey.slice(WALLET_OWNER_PREFIX.length), 10)
    return wallets.find((w) => w.wallet_id === id)?.name ?? 'Unknown wallet'
  }
  return ownerKey
}

export function getOwnerIcon(ownerKey: string): 'wallet' | 'flask' {
  return ownerKey.startsWith(WALLET_OWNER_PREFIX) ? 'wallet' : 'flask'
}
