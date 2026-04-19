import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

const EMAIL = 'michael.hrenka@protonmail.com'
const GITHUB_URL = 'https://github.com/Radivis/'
const X_URL = 'https://x.com/Radivis'
const TELEGRAM_URL = 'https://t.me/Cosmohorse'
const NOSTR_PROFILE_URL =
  'https://njump.me/npub1fc3s4vcdkvpyldkckduau9wr4dn8fpg9475rcvv859djt3zuwfysvkkpx6'

const linkClass =
  'text-foreground underline underline-offset-4 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'

/** Developer contact (Settings). Email is the primary channel; other links are for technical or informal reach-out. */
export function DeveloperContactCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Developer Contact Info</CardTitle>
        <CardDescription className="text-base font-medium text-foreground">
          Michael Hrenka
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <p>
          <span className="text-muted-foreground">E-Mail: </span>
          <a className={linkClass} href={`mailto:${EMAIL}`}>
            {EMAIL}
          </a>
        </p>
        <p>
          <span className="text-muted-foreground">GitHub: </span>
          <a className={linkClass} href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
            {GITHUB_URL}
          </a>
        </p>
        <p>
          <span className="text-muted-foreground">X: </span>
          <a className={linkClass} href={X_URL} target="_blank" rel="noopener noreferrer">
            @Radivis
          </a>
        </p>
        <p>
          <span className="text-muted-foreground">Telegram: </span>
          <a
            className={linkClass}
            href={TELEGRAM_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            @Cosmohorse
          </a>
        </p>
        <p>
          <span className="text-muted-foreground">Nostr: </span>
          <a
            className={linkClass}
            href={NOSTR_PROFILE_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            njump.me
          </a>
        </p>
      </CardContent>
    </Card>
  )
}
