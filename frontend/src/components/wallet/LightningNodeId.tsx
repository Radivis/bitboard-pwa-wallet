import { Zap } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

/**
 * Placeholder card for the in-browser LDK Lightning node.
 * The underlying WASM PoC (bitboard-lightning crate) exists and compiles,
 * but the feature is not yet user-facing. See the LDK Lightning Node
 * Roadmap in .cursor/architecture/plans/ for the full implementation plan.
 */
export function LightningNodeId() {
  return (
    <Card className="opacity-75">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Zap className="h-5 w-5" />
          App-Internal Lightning Node
          <Badge variant="secondary">Work in Progress</Badge>
        </CardTitle>
        <CardDescription>
          A self-custodial Lightning node running directly in the browser via
          LDK compiled to WASM. This feature is under development and not yet
          available.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          In the meantime, use NWC (Nostr Wallet Connect) to connect an
          external Lightning wallet for send and receive capabilities.
        </p>
      </CardContent>
    </Card>
  )
}
