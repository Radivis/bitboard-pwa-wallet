import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ReceiveQrCode } from '@/components/receive/ReceiveQrCode'
import type { ReceiveRail } from '@/components/receive/ReceiveRailIcon'

const RAIL_ICON_MARK: Record<ReceiveRail, { selector: string; mark: string }> = {
  bitcoin: { selector: '.lucide-bitcoin', mark: 'lucide-bitcoin' },
  lightning: { selector: '.lucide-zap', mark: 'lucide-zap' },
  arkade: { selector: 'span', mark: 'arkade-mark.svg' },
  bark: { selector: 'span', mark: 'bark-logomark.svg' },
}

describe('ReceiveQrCode', () => {
  it.each(Object.keys(RAIL_ICON_MARK) as ReceiveRail[])(
    'centers the %s rail icon and does not embed the Bitboard logo',
    (rail) => {
      const { container } = render(<ReceiveQrCode value={`${rail}:payload`} rail={rail} />)
      const railIcon = screen.getByTestId('receive-qr-rail-icon')
      const { selector, mark } = RAIL_ICON_MARK[rail]
      const icon = railIcon.querySelector(selector)

      expect(railIcon).toHaveAttribute('data-rail', rail)
      expect(icon).not.toBeNull()
      if (rail === 'arkade' || rail === 'bark') {
        expect((icon as HTMLElement).style.maskImage).toContain(mark)
      }

      const embeddedImage = container.querySelector('image')
      const imageHref = embeddedImage?.getAttribute('href') ?? ''
      expect(imageHref).not.toContain('bitboard-icon')
      expect(railIcon.querySelector('div')?.style.width).toBe('64px')
      expect(container.querySelector('svg')).toBeInTheDocument()
    },
  )
})
