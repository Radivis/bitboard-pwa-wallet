import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { DesignAppLogo } from '@/components/design/DesignAppLogo'

describe('DesignAppLogo', () => {
  it('uses the text color for the book and the bitcoin colors for the mark', () => {
    render(<DesignAppLogo />)
    const logo = document.querySelector('[data-slot="design-app-logo"]')
    const paths = logo?.querySelectorAll('path')
    expect(paths?.[0]?.getAttribute('class')).toContain('fill-[var(--design-text-regular)]')
    expect(paths?.[1]?.getAttribute('class')).toContain('fill-[var(--design-text-regular)]')
    expect(paths?.[2]?.getAttribute('class')).toContain('fill-[var(--design-special-bitcoin)]')
    expect(paths?.[3]?.getAttribute('class')).toContain('stroke-[var(--design-special-bitcoin-stroke)]')
  })
})
