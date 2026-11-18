import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { BarkReceivePaymentCountInfomodeContent } from '@/components/bark/infomode/BarkReceivePaymentCountInfomodeContent'
import { renderWithProviders } from '@/test-utils/test-providers'
import { article as privacyInArk } from '@/routes/library/articles/privacy-in-ark'

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>()
  return {
    ...actual,
    Link: ({
      children,
      to,
      params,
    }: {
      children: React.ReactNode
      to: string
      params?: { slug?: string }
    }) => (
      <a href={params?.slug ? `${to}/${params.slug}` : to}>{children}</a>
    ),
  }
})

describe('BarkReceivePaymentCountInfomodeContent', () => {
  it('points the count at chain privacy and the Privacy in Ark article', () => {
    renderWithProviders(<BarkReceivePaymentCountInfomodeContent />)
    expect(screen.getByText(/leaves this address unpublished/)).toBeInTheDocument()
    expect(screen.getByText(/Change from your own send/)).toBeInTheDocument()
    expect(screen.getByText(/unfinished board does not count/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Privacy in Ark' })).toHaveAttribute(
      'href',
      expect.stringContaining('privacy-in-ark'),
    )
    expect(privacyInArk.slug).toBe('privacy-in-ark')
    expect(privacyInArk.title).toBe('Privacy in Ark')
  })
})
