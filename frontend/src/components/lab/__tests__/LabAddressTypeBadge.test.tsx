import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AddressType } from '@/lib/wallet-domain-types'
import { LabAddressTypeBadge } from '@/components/lab/LabAddressTypeBadge'
import { LabOwnerDisplayWithAddressType } from '@/components/lab/LabOwnerDisplayWithAddressType'
import { labEntityLabOwner } from '@/lib/lab-owner'

describe('LabAddressTypeBadge', () => {
  it('renders SegWit for segwit address type', () => {
    render(<LabAddressTypeBadge addressType={AddressType.SegWit} />)
    expect(screen.getByText('SegWit')).toBeInTheDocument()
  })

  it('renders Taproot for taproot address type', () => {
    render(<LabAddressTypeBadge addressType={AddressType.Taproot} />)
    expect(screen.getByText('Taproot')).toBeInTheDocument()
  })
})

describe('LabOwnerDisplayWithAddressType', () => {
  const wallets = [{ wallet_id: 1, name: 'Main' }]
  const entities = [
    {
      labEntityId: 1,
      entityName: 'Alice' as string | null,
      addressType: AddressType.SegWit,
    },
  ]

  it('shows name and SegWit badge for lab entity', () => {
    render(
      <LabOwnerDisplayWithAddressType
        owner={labEntityLabOwner(1)}
        wallets={wallets}
        entities={entities}
      />,
    )
    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.getByText('SegWit')).toBeInTheDocument()
  })

  it('shows wallet name without address-type badge', () => {
    render(
      <LabOwnerDisplayWithAddressType
        owner={{ kind: 'wallet', walletId: 1 }}
        wallets={wallets}
        entities={entities}
      />,
    )
    expect(screen.getByText('Main')).toBeInTheDocument()
    expect(screen.queryByText('SegWit')).not.toBeInTheDocument()
  })
})
