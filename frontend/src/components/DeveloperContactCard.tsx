import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { getDeveloperContactLines } from '@/developer-contact/contact-lines'

/** Renders developer contact lines from `developer-contact/contact-lines.txt`. */
export function DeveloperContactCard() {
  const text = getDeveloperContactLines()
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
