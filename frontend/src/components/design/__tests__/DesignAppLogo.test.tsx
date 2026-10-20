import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { DesignAppLogo } from '@/components/design/DesignAppLogo'

describe('DesignAppLogo', () => {
  it('uses the light book color and switches the book to the dark color', () => {
    render(<DesignAppLogo />)
    const logo = document.querySelector('[data-slot="design-app-logo"]')
    const book = logo?.querySelector('path')
    expect(book?.getAttribute('class')).toContain('fill-[#141313]')
    expect(book?.getAttribute('class')).toContain('dark:fill-[#F4F4F4]')
    expect(logo?.querySelector('[stroke="#363535"]')?.getAttribute('class')).toContain('dark:hidden')
  })
})
