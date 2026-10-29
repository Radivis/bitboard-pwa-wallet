import { Zap } from 'lucide-react'
import {
  DesignCard,
  DesignCardContent,
  DesignCardDescription,
  DesignCardHeader,
  DesignCardTitle,
} from '@/components/design/DesignCard'
import { Badge } from '@/components/ui/badge'

/**
 * Placeholder card for the in-browser LDK Lightning node.
 * The underlying WASM PoC (bitboard-lightning crate) exists and compiles,
 * but the feature is not yet user-facing. See the LDK Lightning Node
 * Roadmap in .cursor/architecture/plans/ for the full implementation plan.
 */
export function LightningNodeId() {
  return (
    <DesignCard className="opacity-75">
      <DesignCardHeader>
        <DesignCardTitle className="flex items-center gap-2">
          <Zap className="h-5 w-5" />
          App-Internal Lightning Node
          <Badge variant="secondary">Work in Progress</Badge>
        </DesignCardTitle>
        <DesignCardDescription>
          A self-custodial Lightning node running directly in the browser via
          LDK compiled to WASM. This feature is under development and not yet
          available.
        </DesignCardDescription>
      </DesignCardHeader>
      <DesignCardContent>
        <p className="design-type-regular text-muted-foreground">
          In the meantime, use NWC (Nostr Wallet Connect) to connect an
          external Lightning wallet for send and receive capabilities.
        </p>
      </DesignCardContent>
    </DesignCard>
  )
}
