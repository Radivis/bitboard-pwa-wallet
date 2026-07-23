import { ViewportPortal } from '@xyflow/react'
import type { UnilateralExitGraphEdgePath } from '@/lib/arkade/unilateral-exit-topology'

interface UnilateralExitTreeEdgesOverlayProps {
  edgePaths: UnilateralExitGraphEdgePath[]
}

export function UnilateralExitTreeEdgesOverlay({
  edgePaths,
}: UnilateralExitTreeEdgesOverlayProps) {
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
        data-testid="unilateral-exit-tree-edges"
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
            className={edgePath.animated ? 'unilateral-exit-tree-edge-animated' : undefined}
            data-testid={`unilateral-exit-edge-${edgePath.id}`}
          />
        ))}
      </svg>
    </ViewportPortal>
  )
}
