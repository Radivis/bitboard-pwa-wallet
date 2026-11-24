import { ArrowRight, Bitcoin, CakeSlice, Carrot, type LucideIcon } from 'lucide-react'

import { BitcoinAmountDisplay } from '@/components/BitcoinAmountDisplay'
import { DesignTag } from '@/components/design/DesignTag'
import { designTypeClassName } from '@/components/design/design-type'
import { LabOwnerDisplayWithAddressType } from '@/components/lab/LabOwnerDisplayWithAddressType'
import type { LabOwner } from '@/lib/lab/lab-owner'
import { cn } from '@/lib/shared/utils'
import type { AddressType, WalletSummary } from '@/lib/wallet/wallet-domain-types'

type EntityForLabTransactionCard = {
  labEntityId: number
  entityName: string | null
  addressType: AddressType
}

export type DesignLabTransactionCardProps = {
  sender: LabOwner | null
  receiver: LabOwner | null
  amountSats: number
  feeSats: number
  wallets: WalletSummary[]
  entities: readonly EntityForLabTransactionCard[]
  variant: 'transfer' | 'coinbase'
  className?: string
}

export function DesignLabTransactionCard({
  sender,
  receiver,
  amountSats,
  feeSats,
  wallets,
  entities,
  variant,
  className,
}: DesignLabTransactionCardProps) {
  const recipient =
    variant === 'coinbase' && receiver == null ? (
      'unknown reward'
    ) : receiver != null ? (
      <LabOwnerDisplayWithAddressType owner={receiver} wallets={wallets} entities={entities} />
    ) : (
      'unknown'
    )

  return (
    <div
      data-slot="design-lab-transaction-card"
      className={cn(
        'design-ui flex w-fit max-w-full flex-col gap-2 rounded-[20px] px-6 py-3',
        className,
      )}
    >
      {variant === 'coinbase' ? (
        <DesignTag className="w-fit self-start" icon={<Carrot aria-hidden />}>
          Coinbase
        </DesignTag>
      ) : null}
      <div
        data-lab-transaction-parties
        className="flex w-full flex-col gap-2 md:flex-row md:items-center md:justify-between md:gap-2.5"
      >
        {variant === 'transfer' ? (
          <span className={cn(designTypeClassName.regular, 'min-w-0 text-[var(--design-text-regular)]')}>
            {sender != null ? (
              <LabOwnerDisplayWithAddressType owner={sender} wallets={wallets} entities={entities} />
            ) : (
              'unknown'
            )}
          </span>
        ) : null}
        <span data-lab-transaction-recipient className="ml-auto flex shrink-0 items-center gap-2.5">
          <ArrowRight className="size-6 shrink-0 text-[var(--design-text-regular)]" aria-hidden />
          <span className={cn(designTypeClassName.regular, 'min-w-0 text-[var(--design-text-regular)]')}>
            {recipient}
          </span>
        </span>
      </div>
      <LabTransactionAmountRow icon={Bitcoin} label="Amount" amountSats={amountSats} />
      <LabTransactionAmountRow icon={CakeSlice} label="Fee" amountSats={feeSats} />
    </div>
  )
}

function LabTransactionAmountRow({
  icon: Icon,
  label,
  amountSats,
}: {
  icon: LucideIcon
  label: string
  amountSats: number
}) {
  return (
    <div className="flex items-center justify-between gap-1">
      <Icon className="size-6 shrink-0 text-[var(--design-text-regular)]" aria-hidden />
      <span className="sr-only">{label}</span>
      <BitcoinAmountDisplay amountSats={amountSats} size="sm" allowUnitToggle={false} />
    </div>
  )
}
