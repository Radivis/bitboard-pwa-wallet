import type { ArkadeOperatorConfigDiffEntry } from '@/workers/arkade-api'

interface OperatorConfigDiffViewerProps {
  entries: ArkadeOperatorConfigDiffEntry[]
}

export function OperatorConfigDiffViewer({ entries }: OperatorConfigDiffViewerProps) {
  if (entries.length === 0) {
    return (
      <p className="design-type-regular text-muted-foreground">
        No field-level differences were detected between the accepted and pending operator
        configuration.
      </p>
    )
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <table
        className="design-type-regular w-full text-left"
        data-testid="arkade-operator-config-diff-table"
      >
        <thead className="design-type-regular border-b bg-muted/40 text-muted-foreground">
          <tr>
            <th className="design-type-emphasis px-3 py-2">Setting</th>
            <th className="design-type-emphasis px-3 py-2">Current (trusted)</th>
            <th className="design-type-emphasis px-3 py-2">Proposed (ASP)</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.fieldKey} className="border-b last:border-b-0 align-top">
              <th className="design-type-emphasis px-3 py-2 text-foreground">{entry.fieldLabel}</th>
              <td className="design-type-addresses px-3 py-2 break-all">{entry.acceptedValue}</td>
              <td className="design-type-addresses px-3 py-2 break-all">{entry.pendingValue}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
