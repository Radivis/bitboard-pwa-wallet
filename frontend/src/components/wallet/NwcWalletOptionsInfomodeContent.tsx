import {
  Cloud,
  Monitor,
  Server,
  Smartphone,
  Wallet,
  Zap,
} from 'lucide-react'
import { ArticleLink } from '@/lib/library/article-shared'
import { cn } from '@/lib/utils'

const rowClass =
  'flex gap-2 rounded-md border border-border/60 bg-muted/30 px-2 py-2 text-left'

function GuideRow({
  icon: Icon,
  title,
  blurb,
  slug,
}: {
  icon: typeof Smartphone
  title: string
  blurb: string
  slug: string
}) {
  return (
    <div className={rowClass}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="text-xs font-medium leading-tight text-popover-foreground">
          <ArticleLink slug={slug}>{title}</ArticleLink>
        </p>
        <p className="text-xs leading-snug text-muted-foreground">{blurb}</p>
      </div>
    </div>
  )
}

/**
 * Rich Infomode body for NWC wallet options on Management → Connect Lightning Wallet.
 * Must be a no-props component for InfomodeRegistry.
 */
export function NwcWalletOptionsInfomodeContent() {
  return (
    <div
      className={cn(
        'space-y-3 pr-1',
        '[&_.text-primary]:text-primary [&_a]:underline-offset-2 [&_a]:hover:underline',
      )}
    >
      <h2 className="text-sm font-semibold leading-tight text-popover-foreground">
        NWC-compatible wallets
      </h2>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Bitboard uses Nostr Wallet Connect (NIP-47). Pick a wallet that fits how you use
        Bitcoin and Lightning, then paste its NWC connection string below.
      </p>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Background:{' '}
        <ArticleLink slug="what-is-nostr">What is Nostr?</ArticleLink>
        {' · '}
        <ArticleLink slug="nostr-wallet-connect">Nostr Wallet Connect (NWC)</ArticleLink>
      </p>

      <div className="space-y-1.5">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Simple
        </h3>
        <div className="space-y-1.5">
          <GuideRow
            icon={Smartphone}
            slug="nwc-alby-go"
            title="Alby Go"
            blurb="For mobile-first Lightning: install the app, enable NWC, copy the connection string."
          />
          <GuideRow
            icon={Monitor}
            slug="nwc-alby-browser-extension"
            title="Alby browser extension"
            blurb="If you mostly use Bitboard in the same desktop browser, the extension keeps NWC one click away."
          />
          <GuideRow
            icon={Cloud}
            slug="nwc-alby-hub-cloud"
            title="Alby Hub (cloud)"
            blurb="Managed Hub in the cloud when you want someone else to run the server, for a fee."
          />
          <GuideRow
            icon={Zap}
            slug="nwc-primal-wallet"
            title="Primal"
            blurb="If you already live on Nostr, Primal pairs a wallet with the social stack and supports NWC."
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Advanced
        </h3>
        <div className="space-y-1.5">
          <GuideRow
            icon={Zap}
            slug="nwc-zeus"
            title="Zeus"
            blurb="Connect to your own LND or Core Lightning node and expose NWC from the app."
          />
          <GuideRow
            icon={Server}
            slug="nwc-lnbits"
            title="LNbits"
            blurb="Self-host LNbits and create wallets that speak NWC—great for hackers and homelabbers."
          />
          <GuideRow
            icon={Wallet}
            slug="nwc-electrum"
            title="Electrum"
            blurb="Desktop Electrum with Lightning can participate in NWC where supported."
          />
          <GuideRow
            icon={Server}
            slug="nwc-self-hosted-alby-hub"
            title="Self-hosted Alby Hub"
            blurb="Run Hub yourself for full control versus Alby Hub Cloud—more setup, no hosted fee to Alby."
          />
        </div>
      </div>
    </div>
  )
}
