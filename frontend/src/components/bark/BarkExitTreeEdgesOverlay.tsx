import { ViewportPortal } from '@xyflow/react'
import type { BarkExitGraphEdgePath } from '@/lib/bark/bark-exit-graph-layout'

interface BarkExitTreeEdgesOverlayProps {
  edgePaths: BarkExitGraphEdgePath[]
}

export function BarkExitTreeEdgesOverlay({ edgePaths }: BarkExitTreeEdgesOverlayProps) {
  if (edgePaths.length === 0) {
    return null
  }

  return (
    <ViewportPortal>
      <svg
        className="pointer-events-none"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          overflow: 'visible',
          zIndex: -1,
        }}
        data-testid="bark-exit-tree-edges"
        aria-hidden
      >
        {edgePaths.map((edgePath) => (
          <path
            key={edgePath.id}
            d={edgePath.path}
            fill="none"
            stroke={edgePath.stroke}
            strokeWidth={edgePath.strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            className={edgePath.animated ? 'bark-exit-tree-edge-animated' : undefined}
            data-testid={`bark-exit-edge-${edgePath.id}`}
          />
        ))}
      </svg>
    </ViewportPortal>
  )
}
