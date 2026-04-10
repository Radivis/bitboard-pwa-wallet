import type { LabBlock } from '@/workers/lab-api'
import { Link } from '@tanstack/react-router'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { InfomodeWrapper } from '@/components/infomode/InfomodeWrapper'

export function LabPreviousBlocksCard({ blocks }: { blocks: LabBlock[] }) {
  const byHeightDesc = [...blocks].sort((a, b) => b.height - a.height)

  return (
    <InfomodeWrapper
      infoId="lab-previous-blocks-card"
      infoTitle="Previous blocks (lab)"
      infoText="Heights of blocks already mined in this simulator. Later you will open a block to see its transactions; for now only heights are listed."
      className="rounded-xl"
    >
      <Card>
        <CardHeader>
          <CardTitle>Previous blocks</CardTitle>
          <CardDescription>Open mined blocks and the current template</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-3">
            <Link
              to="/lab/block/current"
              preload={false}
              className="inline-flex rounded-md border border-border bg-muted/40 px-2 py-1 text-sm font-medium transition-colors hover:bg-muted"
            >
              current
            </Link>
          </div>
          {byHeightDesc.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">No blocks mined yet.</p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {byHeightDesc.map((b) => (
                <Link
                  key={b.blockHash}
                  to="/lab/block/$height"
                  params={{ height: String(b.height) }}
                  preload={false}
                  className="rounded-md border border-border bg-muted/40 px-2 py-1 font-mono text-sm"
                >
                  {b.height}
                </Link>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </InfomodeWrapper>
  )
}
