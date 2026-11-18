import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { ArkadeReceivePaymentCountInfomodeContent } from '@/components/arkade/infomode/ArkadeReceivePaymentCountInfomodeContent'
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

describe('ArkadeReceivePaymentCountInfomodeContent', () => {
  it('points the count at chain privacy and the Privacy in Ark article', () => {
    renderWithProviders(<ArkadeReceivePaymentCountInfomodeContent />)
    expect(screen.getByText(/leaves this script unpublished/)).toBeInTheDocument()
    expect(screen.getByText(/Change from your own send/)).toBeInTheDocument()
    expect(screen.getByText(/unspent boarding deposit/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Privacy in Ark' })).toHaveAttribute(
      'href',
      expect.stringContaining('privacy-in-ark'),
    )
    expect(privacyInArk.slug).toBe('privacy-in-ark')
    expect(privacyInArk.title).toBe('Privacy in Ark')
  })
})
