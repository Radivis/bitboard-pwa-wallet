import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { ArkadeVtxoClassificationIcon } from '@/components/arkade/ArkadeVtxoClassificationIcon'
import { ARKADE_VTXO_CLASSIFICATIONS } from '@/lib/arkade/arkade-vtxo-viewer-display'

describe('ArkadeVtxoClassificationIcon', () => {
  it('renders an svg for every classification', () => {
    for (const classification of ARKADE_VTXO_CLASSIFICATIONS) {
      const { container, unmount } = render(
        <ArkadeVtxoClassificationIcon classification={classification} />,
      )
      expect(container.querySelector('svg')).toBeInTheDocument()
      unmount()
    }
  })
})
