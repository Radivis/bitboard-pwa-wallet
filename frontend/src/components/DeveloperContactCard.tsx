import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

function getContactsText(): string {
  const raw = import.meta.env.VITE_CONTACTS
  if (raw === undefined || raw === null) return ''
  return String(raw).trim()
}

/** Renders developer contact lines when `VITE_CONTACTS` is set at build time (`.env.contacts`). */
export function DeveloperContactCard() {
  const text = getContactsText()
  if (!text) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle>Developer contact</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="whitespace-pre-wrap text-sm text-muted-foreground">{text}</p>
      </CardContent>
    </Card>
  )
}
