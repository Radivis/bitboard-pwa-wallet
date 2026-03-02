import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { render } from '../test-utils/test-utils'
import SubscribeForm, {
  SUBSCRIPTION_FORM_LEGEND,
  SUBSCRIPTION_SUCCESS_MESSAGE,
} from './SubscribeForm'

describe('SubscribeForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the subscription form with legend and input fields', () => {
    render(<SubscribeForm />)

    expect(screen.getByText(SUBSCRIPTION_FORM_LEGEND)).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
    expect(screen.getByLabelText('Name')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Subscribe' })).toBeInTheDocument()
  })

  it('has required email and name fields', () => {
    render(<SubscribeForm />)

    const emailInput = screen.getByLabelText('Email')
    const nameInput = screen.getByLabelText('Name')

    expect(emailInput).toBeRequired()
    expect(nameInput).toBeRequired()
  })

  it('displays error message when API returns validation error for empty fields', async () => {
    const user = userEvent.setup()
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 400,
      text: () => Promise.resolve('Name is invalid'),
    } as Response)

    render(<SubscribeForm />)

    const subscribeButton = screen.getByRole('button', { name: 'Subscribe' })
    await user.click(subscribeButton)

    await waitFor(() => {
      expect(screen.getByText('Name is invalid')).toBeInTheDocument()
    })
  })

  it('displays error message when API returns validation error for invalid email', async () => {
    const user = userEvent.setup()
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 400,
      text: () => Promise.resolve('Email is invalid'),
    } as Response)

    render(<SubscribeForm />)

    await user.type(screen.getByLabelText('Email'), 'not-an-email')
    await user.type(screen.getByLabelText('Name'), 'Test User')
    await user.click(screen.getByRole('button', { name: 'Subscribe' }))

    await waitFor(() => {
      expect(screen.getByText('Email is invalid')).toBeInTheDocument()
    })
  })

  it('displays success message when subscription succeeds', async () => {
    const user = userEvent.setup()
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
    } as Response)

    render(<SubscribeForm />)

    await user.type(screen.getByLabelText('Email'), 'user@example.com')
    await user.type(screen.getByLabelText('Name'), 'Test User')
    await user.click(screen.getByRole('button', { name: 'Subscribe' }))

    await waitFor(() => {
      expect(screen.getByText(SUBSCRIPTION_SUCCESS_MESSAGE)).toBeInTheDocument()
    })
  })

  it('sends name and email to POST /api/subscriptions on submit', async () => {
    const user = userEvent.setup()
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
    } as Response)

    render(<SubscribeForm />)

    await user.type(screen.getByLabelText('Email'), 'subscriber@test.com')
    await user.type(screen.getByLabelText('Name'), 'Jane Doe')
    await user.click(screen.getByRole('button', { name: 'Subscribe' }))

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        '/api/subscriptions',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        })
      )
      const callBody = JSON.parse(fetchSpy.mock.calls[0][1].body as string)
      expect(callBody).toEqual({
        email: 'subscriber@test.com',
        name: 'Jane Doe',
      })
    })
  })
})
