import { ArticleLink, ArticleSection, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'lightning-invoices',
  title: 'Lightning Invoices',
  tagIds: ['lightning', 'standards'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <ArticleSection title="In a Nutshell">
        <p>
          A Lightning invoice is a payment request—a string you share so someone can pay you over
          the <ArticleLink slug="the-lightning-network">Lightning Network</ArticleLink>. It encodes
          who you are, how much you want (optionally), and a cryptographic secret that proves
          payment was received.
        </p>
      </ArticleSection>

      <ArticleSection title="How it Works">
        <p>
          When you want to receive a Lightning payment, you generate an <strong>invoice</strong>. It
          looks like a long string starting with <code className="text-sm">lnbc</code> (mainnet) or{' '}
          <code className="text-sm">lntb</code> / <code className="text-sm">lnbcrt</code> (testnet /
          regtest). You share this string with the payer—via QR code, copy-paste, or embedded in an
          app.
        </p>

        <p className="mt-4">
          <strong>Invoices with a specified amount</strong> include the exact payment amount. The
          payer cannot send more or less—they either pay the exact amount or the payment fails. This
          is the most common type: &quot;Pay 10,000 sats for this coffee.&quot;
        </p>

        <p className="mt-4">
          <strong>Amountless invoices</strong> (also called &quot;zero-amount&quot; or
          &quot;any-amount&quot; invoices) let the payer choose how much to send. These are useful
          for tips, donations, or situations where you want flexibility. The payer specifies the
          amount when sending, and any positive amount succeeds.
        </p>

        <p className="mt-4">
          Invoices typically <strong>expire</strong> after a set time (commonly 1 hour or 24 hours).
          Once expired, the payment hash is no longer valid and the invoice cannot be paid.
        </p>
      </ArticleSection>

      <ArticleSection title="How it Really Works">
        <p>
          Lightning invoices are specified in <strong>BOLT-11</strong> (see{' '}
          <ArticleLink slug="what-is-a-bolt">What is a BOLT?</ArticleLink>). The invoice encodes
          several pieces of data:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Payment hash</strong>: A hash of a secret (the preimage). When the payer sends
            funds, they commit to this hash. You reveal the preimage to claim the payment,
            providing cryptographic proof that you received the money.
          </li>
          <li>
            <strong>Destination</strong>: Your node&apos;s public key (unless using route hints or
            blinded paths for privacy).
          </li>
          <li>
            <strong>Amount</strong>: Optional. If present, this is the exact amount required. If
            absent, the invoice is amountless.
          </li>
          <li>
            <strong>Expiry</strong>: How long the invoice is valid (default: 1 hour in most
            implementations).
          </li>
          <li>
            <strong>Description</strong>: Optional text explaining what the payment is for (e.g.,
            &quot;Coffee at Bob&apos;s Cafe&quot;).
          </li>
          <li>
            <strong>Route hints</strong>: Optional hints for finding a path to your node, useful
            if your channels are private.
          </li>
        </ul>

        <p className="mt-4">
          <strong>Payment flow:</strong> The payer&apos;s wallet decodes the invoice, finds a route
          to your node, and sends a payment locked to the payment hash. Each hop in the route uses
          an HTLC (hash time-locked contract) so that either the entire payment succeeds or it fails
          atomically—no one can steal funds in the middle. When the payment reaches you, you reveal
          the preimage to complete it.
        </p>

        <p className="mt-4">
          <strong>Privacy consideration:</strong> Standard invoices reveal your node&apos;s public
          key to the payer. Newer proposals like <strong>BOLT-12 offers</strong> and{' '}
          <strong>blinded paths</strong> improve privacy by hiding the receiver&apos;s identity
          until payment is in progress.
        </p>

        <p className="mt-4">
          <strong>Amountless invoices in practice:</strong> Since the invoice itself contains no
          amount, the payer must specify one when sending. In{' '}
          <ArticleLink slug="nostr-wallet-connect">NWC</ArticleLink>, this means the{' '}
          <code className="text-sm">pay_invoice</code> request includes a separate{' '}
          <code className="text-sm">amount</code> parameter (in millisatoshis) alongside the
          invoice string. The wallet then pays that amount using the invoice&apos;s payment hash
          and destination.
        </p>
      </ArticleSection>

      <ArticleSection title="Deep Dive Resources">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <a
              href="https://github.com/lightning/bolts/blob/master/11-payment-encoding.md"
              className="text-primary underline-offset-4 hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              BOLT-11: Invoice Protocol for Lightning Payments
            </a>
          </li>
          <li>
            <a
              href="https://github.com/lightning/bolts/blob/master/12-offer-encoding.md"
              className="text-primary underline-offset-4 hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              BOLT-12: Offers
            </a>{' '}
            — The next-generation invoice format with better privacy
          </li>
        </ul>
      </ArticleSection>
    </div>
  ),
}
