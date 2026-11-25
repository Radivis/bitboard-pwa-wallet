import { DashboardActivityRailBadge } from '@/components/DashboardActivityRailBadge'
import { ActivityTimeButton } from '@/components/ActivityTimeButton'
import {
  DesignTransactionCard,
  type DesignTransactionDetail,
} from '@/components/design/DesignTransactionCard'
import { InfomodeWrapper } from '@/components/infomode/InfomodeWrapper'
import { SignedBitcoinAmount } from '@/components/SignedBitcoinAmount'
import {
  ARKADE_ACTIVITY_BOARDING_INFOMODE,
  ARKADE_ACTIVITY_PAYMENT_INFOMODE,
  ARKADE_INFOMODE_IDS,
} from '@/lib/arkade/arkade-infomode'
import {
  ARKADE_BOARDING_ACTIVITY_LABEL,
  ONCHAIN_ARKADE_BOARDING_ACTIVITY_LABEL,
} from '@/lib/lightning/lightning-dashboard-sync'
import { truncateAddress } from '@/lib/wallet/bitcoin-utils'
import type { ArkadePaymentRow } from '@/workers/arkade-api'

const COPIED_TRANSACTION_ID = 'Transaction id copied to clipboard'

export function ArkadePaymentItem({
  payment,
  activityLabel,
}: {
  payment: ArkadePaymentRow
  activityLabel?: string
}) {
  const isSent = payment.direction === 'outgoing'
  const resolvedActivityLabel = activityLabel ?? 'Arkade'
  const isBoarding =
    resolvedActivityLabel === ARKADE_BOARDING_ACTIVITY_LABEL ||
    resolvedActivityLabel === ONCHAIN_ARKADE_BOARDING_ACTIVITY_LABEL
  const activityInfomode = isBoarding
    ? {
        infoId: ARKADE_INFOMODE_IDS.activityBoarding,
        title: ARKADE_ACTIVITY_BOARDING_INFOMODE.title,
        text: ARKADE_ACTIVITY_BOARDING_INFOMODE.text,
      }
    : {
        infoId: ARKADE_INFOMODE_IDS.activityPayment,
        title: ARKADE_ACTIVITY_PAYMENT_INFOMODE.title,
        text: ARKADE_ACTIVITY_PAYMENT_INFOMODE.text,
      }
  const details: DesignTransactionDetail[] = [
    {
      label: 'TXID',
      value: truncateAddress(payment.txid, 5, 5),
      copyText: payment.txid,
      copyAriaLabel: 'Copy transaction id',
      copiedMessage: COPIED_TRANSACTION_ID,
    },
    { label: 'Kind', value: resolvedActivityLabel, prose: true },
  ]
  if (payment.memo != null && payment.memo !== '') {
    details.push({ label: 'Memo', value: payment.memo, prose: true })
  }

  return (
    <DesignTransactionCard
      data-testid={`arkade-payment-${payment.txid}`}
      direction={isSent ? 'sent' : 'received'}
      settlement="confirmed"
      amount={<SignedBitcoinAmount sign={isSent ? '-' : '+'} amountSats={payment.amountSats} />}
      time={payment.timestamp > 0 ? <ActivityTimeButton unixSeconds={payment.timestamp} /> : undefined}
      tags={
        <InfomodeWrapper
          infoId={activityInfomode.infoId}
          infoTitle={activityInfomode.title}
          infoText={activityInfomode.text}
          as="span"
          onClick={(event) => event.stopPropagation()}
        >
          <DashboardActivityRailBadge label={resolvedActivityLabel} />
        </InfomodeWrapper>
      }
      details={details}
    />
  )
}
