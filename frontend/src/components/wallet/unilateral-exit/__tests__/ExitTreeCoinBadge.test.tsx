import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ExitTreeCoinBadge } from '@/components/wallet/unilateral-exit/ExitTreeCoinBadge'

const TEST_ID_PREFIX = 'exit-tree'
const TEST_ID_SUFFIX = 'abcd1234'

describe('ExitTreeCoinBadge', () => {
  it('exit_coin_badge_renders_exitable_stage', () => {
    render(
      <ExitTreeCoinBadge
        count={1}
        stage="exitable"
        testIdPrefix={TEST_ID_PREFIX}
        testIdSuffix={TEST_ID_SUFFIX}
      />,
    )

    const badge = screen.getByTestId('exit-tree-vtxo-count-abcd1234')
    expect(badge).toHaveAttribute('data-coin-stage', 'exitable')
    expect(badge).toHaveAttribute('aria-label', '1 exitable VTXO')
    expect(badge.querySelector('svg.lucide-coins')).not.toBeNull()
  })

  it('exit_coin_badge_renders_timelocked_stage', () => {
    render(
      <ExitTreeCoinBadge
        count={2}
        stage="timelocked"
        testIdPrefix={TEST_ID_PREFIX}
        testIdSuffix={TEST_ID_SUFFIX}
      />,
    )

    const badge = screen.getByTestId('exit-tree-timelocked-vtxo-count-abcd1234')
    expect(badge).toHaveAttribute('data-coin-stage', 'timelocked')
    expect(badge).toHaveAttribute('aria-label', '2 VTXOs waiting for timelock')
    expect(badge).toHaveTextContent('2×')
    expect(badge.querySelector('svg.lucide-hourglass')).not.toBeNull()
  })

  it('exit_coin_badge_renders_claimable_stage', () => {
    render(
      <ExitTreeCoinBadge
        count={3}
        stage="claimable"
        testIdPrefix={TEST_ID_PREFIX}
        testIdSuffix={TEST_ID_SUFFIX}
      />,
    )

    const badge = screen.getByTestId('exit-tree-claimable-vtxo-count-abcd1234')
    expect(badge).toHaveAttribute('data-coin-stage', 'claimable')
    expect(badge).toHaveAttribute('aria-label', '3 claimable VTXOs')
    expect(badge.querySelector('svg.lucide-hand-coins')).not.toBeNull()
  })

  it('exit_coin_badge_renders_nothing_without_vtxos', () => {
    const { container } = render(
      <ExitTreeCoinBadge
        count={0}
        stage="claimable"
        testIdPrefix={TEST_ID_PREFIX}
        testIdSuffix={TEST_ID_SUFFIX}
      />,
    )

    expect(container).toBeEmptyDOMElement()
  })
})
