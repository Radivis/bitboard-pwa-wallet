import type { ArkadeOperatorConfigDiffEntry } from '@/workers/arkade-api'

interface OperatorConfigDiffViewerProps {
  entries: ArkadeOperatorConfigDiffEntry[]
}

export function OperatorConfigDiffViewer({ entries }: OperatorConfigDiffViewerProps) {
  if (entries.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No field-level differences were detected between the accepted and pending operator
        configuration.
      </p>
    )
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-left text-sm">
        <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Setting</th>
            <th className="px-3 py-2 font-medium">Current (trusted)</th>
            <th className="px-3 py-2 font-medium">Proposed (ASP)</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.fieldKey} className="border-b last:border-b-0 align-top">
              <th className="px-3 py-2 font-medium text-foreground">{entry.fieldLabel}</th>
              <td className="px-3 py-2 font-mono text-xs break-all">{entry.acceptedValue}</td>
              <td className="px-3 py-2 font-mono text-xs break-all">{entry.pendingValue}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
