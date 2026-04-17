import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

function getImprintText(): string {
  const raw = import.meta.env.VITE_IMPRINT
  if (raw === undefined || raw === null) return ''
  return String(raw).trim()
}

/** Renders the legal imprint when `VITE_IMPRINT` is set at build time (`.env.imprint`). */
export function ImpressumBlock() {
  const text = getImprintText()
  if (!text) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle>Impressum</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="whitespace-pre-wrap text-sm text-muted-foreground">{text}</p>
      </CardContent>
    </Card>
  )
}
