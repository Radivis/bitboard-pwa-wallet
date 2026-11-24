import { ArrowUpFromLine } from 'lucide-react'

import { BitcoinAmountDisplay } from '@/components/BitcoinAmountDisplay'
import { DashboardActivityRailBadge } from '@/components/DashboardActivityRailBadge'
import { ActivityTimeButton } from '@/components/ActivityTimeButton'
import { DesignTag } from '@/components/design/DesignTag'
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
import {
  formatTxDirection,
  getTxGrossWalletDebitSats,
  getTxListDisplayAmountSats,
  onchainConfirmationCount,
  truncateAddress,
} from '@/lib/wallet/bitcoin-utils'
import type { TransactionDetails } from '@/workers/crypto-types'
import { CPFP_FEE_BUMP_ACTIVITY_LABEL } from '@/components/TransactionItem'

const COPIED_TRANSACTION_ID = 'Transaction id copied to clipboard'

export function DashboardOnchainTransactionCard({
  transaction,
  activityLabel,
  localTipHeight,
}: {
  transaction: TransactionDetails
  activityLabel?: string
  localTipHeight: number | null
}) {
  const direction = formatTxDirection(transaction)
  const isSent = direction === 'sent'
  const confirmations = onchainConfirmationCount(transaction, localTipHeight)
  const tags = (
    <ChainActivityTags isCpfpFeeBump={transaction.isCpfpFeeBump === true} activityLabel={activityLabel} />
  )

  return (
    <DesignTransactionCard
      data-testid={`tx-${transaction.txid}`}
      direction={direction}
      settlement={transaction.isConfirmed ? 'confirmed' : 'pending'}
      amount={
        <SignedBitcoinAmount
          sign={isSent ? '-' : '+'}
          amountSats={getTxListDisplayAmountSats(transaction)}
        />
      }
      time={
        transaction.confirmationTime != null && transaction.confirmationTime > 0 ? (
          <ActivityTimeButton unixSeconds={transaction.confirmationTime} />
        ) : undefined
      }
      tags={tags}
      details={onchainDetails(transaction, isSent, confirmations)}
    />
  )
}

function onchainDetails(
  transaction: TransactionDetails,
  isSent: boolean,
  confirmations: number | null,
): DesignTransactionDetail[] {
  const details: DesignTransactionDetail[] = [
    {
      label: 'TXID',
      value: truncateAddress(transaction.txid, 5, 5),
      copyText: transaction.txid,
      copyAriaLabel: 'Copy transaction id',
      copiedMessage: COPIED_TRANSACTION_ID,
    },
  ]
  if (transaction.feeSats != null) {
    details.push({
      label: 'Fee',
      value: <BitcoinAmountDisplay amountSats={transaction.feeSats} amountTypography="addresses" />,
    })
  }
  if (isSent) {
    details.push({
      label: 'Total (incl. fee)',
      value: (
        <BitcoinAmountDisplay
          amountSats={getTxGrossWalletDebitSats(transaction)}
          amountTypography="addresses"
        />
      ),
    })
  }
  if (confirmations != null) {
    details.push({ label: 'Confirmations', value: String(confirmations) })
  }
  if (transaction.isConfirmed && transaction.confirmationBlockHeight != null) {
    details.push({
      label: 'Block height',
      value: transaction.confirmationBlockHeight.toLocaleString(),
    })
  }
  return details
}

function ChainActivityTags({
  isCpfpFeeBump,
  activityLabel,
}: {
  isCpfpFeeBump: boolean
  activityLabel?: string
}) {
  const activityInfomode = activityInfomodeForLabel(activityLabel)
  if (!isCpfpFeeBump && (activityLabel == null || activityLabel === '')) return null

  return (
    <div className="flex flex-wrap items-center gap-1">
      {isCpfpFeeBump ? (
        <DesignTag icon={<ArrowUpFromLine className="size-4" aria-hidden />}>
          {CPFP_FEE_BUMP_ACTIVITY_LABEL}
        </DesignTag>
      ) : null}
      {activityLabel != null && activityLabel !== '' && activityInfomode != null ? (
        <InfomodeWrapper
          infoId={activityInfomode.infoId}
          infoTitle={activityInfomode.title}
          infoText={activityInfomode.text}
          as="span"
          onClick={(event) => event.stopPropagation()}
        >
          <DashboardActivityRailBadge label={activityLabel} />
        </InfomodeWrapper>
      ) : activityLabel != null && activityLabel !== '' ? (
        <span onClick={(event) => event.stopPropagation()}>
          <DashboardActivityRailBadge label={activityLabel} />
        </span>
      ) : null}
    </div>
  )
}

function activityInfomodeForLabel(activityLabel: string | undefined) {
  if (activityLabel == null || activityLabel === '') return null
  const isBoarding =
    activityLabel === ARKADE_BOARDING_ACTIVITY_LABEL ||
    activityLabel === ONCHAIN_ARKADE_BOARDING_ACTIVITY_LABEL
  if (isBoarding) {
    return {
      infoId: ARKADE_INFOMODE_IDS.activityBoarding,
      title: ARKADE_ACTIVITY_BOARDING_INFOMODE.title,
      text: ARKADE_ACTIVITY_BOARDING_INFOMODE.text,
    }
  }
  if (activityLabel === 'Arkade') {
    return {
      infoId: ARKADE_INFOMODE_IDS.activityPayment,
      title: ARKADE_ACTIVITY_PAYMENT_INFOMODE.title,
      text: ARKADE_ACTIVITY_PAYMENT_INFOMODE.text,
    }
  }
  return null
}
