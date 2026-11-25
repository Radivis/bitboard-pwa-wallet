import { Zap } from 'lucide-react'

import { BitcoinAmountDisplay } from '@/components/BitcoinAmountDisplay'
import { ActivityTimeButton } from '@/components/ActivityTimeButton'
import { DesignTag } from '@/components/design/DesignTag'
import {
  DesignTransactionCard,
  type DesignTransactionDetail,
} from '@/components/design/DesignTransactionCard'
import { SignedBitcoinAmount } from '@/components/SignedBitcoinAmount'
import { getLnOutgoingTotalInclFeeSats } from '@/lib/lightning/lightning-backend-service'
import type { LightningPaymentWithWallet } from '@/lib/lightning/lightning-dashboard-sync'
import { truncateAddress } from '@/lib/wallet/bitcoin-utils'

const COPIED_PAYMENT_HASH = 'Payment hash copied to clipboard'

export function LightningPaymentItem({ payment }: { payment: LightningPaymentWithWallet }) {
  const isSent = payment.direction === 'outgoing'
  const details: DesignTransactionDetail[] = [
    { label: 'Lightning wallet', value: payment.walletLabel, prose: true },
    {
      label: 'Payment hash',
      value: truncateAddress(payment.paymentHash, 5, 5),
      copyText: payment.paymentHash,
      copyAriaLabel: 'Copy payment hash',
      copiedMessage: COPIED_PAYMENT_HASH,
    },
  ]
  if (payment.memo !== '') {
    details.push({ label: 'Memo', value: payment.memo, prose: true })
  }
  if (payment.feesPaidSats > 0) {
    details.push({
      label: 'Fee',
      value: <BitcoinAmountDisplay amountSats={payment.feesPaidSats} amountTypography="addresses" />,
    })
  }
  if (isSent) {
    details.push({
      label: 'Total (incl. fee)',
      value: (
        <BitcoinAmountDisplay
          amountSats={getLnOutgoingTotalInclFeeSats(payment)}
          amountTypography="addresses"
        />
      ),
    })
  }

  return (
    <DesignTransactionCard
      data-testid={`ln-payment-${payment.connectionId}-${payment.paymentHash}`}
      direction={isSent ? 'sent' : 'received'}
      settlement={payment.isPending ? 'pending' : 'confirmed'}
      amount={<SignedBitcoinAmount sign={isSent ? '-' : '+'} amountSats={payment.amountSats} />}
      time={payment.timestamp > 0 ? <ActivityTimeButton unixSeconds={payment.timestamp} /> : undefined}
      tags={
        <DesignTag icon={<Zap className="size-4" aria-hidden />}>
          Lightning
        </DesignTag>
      }
      details={details}
    />
  )
}
