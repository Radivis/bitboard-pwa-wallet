import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PageHeader } from '@/components/PageHeader'
import { DesignButton } from '@/components/design/DesignButton'
import { DesignCardTitle } from '@/components/design/DesignCard'
import { DesignInput } from '@/components/design/DesignInput'
import { DesignNavButton } from '@/components/design/DesignNavButton'
import { DesignTag } from '@/components/design/DesignTag'
import { designTypeClassName } from '@/components/design/design-type'

describe('legal type styles', () => {
  it('assigns each role its type class', () => {
    render(
      <div>
        <PageHeader title="Send Bitcoin" />
        <PageHeader title="Library" variant="area" />
        <DesignButton>Continue</DesignButton>
        <DesignNavButton>Wallet</DesignNavButton>
        <DesignCardTitle>Balance</DesignCardTitle>
        <DesignTag>Taproot</DesignTag>
        <DesignInput aria-label="Address" defaultValue="bc1qexample" />
        <p className={designTypeClassName.hero}>Start</p>
      </div>,
    )

    expect(screen.getByRole('heading', { name: 'Send Bitcoin' })).toHaveClass(
      designTypeClassName.screenHeading,
    )
    expect(screen.getByRole('heading', { name: 'Library' })).toHaveClass(
      designTypeClassName.areaHeading,
    )
    expect(screen.getByRole('button', { name: 'Continue' })).toHaveClass(designTypeClassName.button)
    expect(screen.getByRole('button', { name: 'Wallet' })).toHaveClass(designTypeClassName.largeButton)
    expect(screen.getByText('Balance')).toHaveClass(designTypeClassName.emphasis)
    expect(screen.getByText('Taproot')).toHaveClass(designTypeClassName.metadata)
    expect(screen.getByRole('textbox', { name: 'Address' })).toHaveClass(designTypeClassName.addresses)
    expect(screen.getByText('Start')).toHaveClass(designTypeClassName.hero)
  })
})
