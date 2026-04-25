import { ArticleLink, ArticleSection, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'what-is-nostr',
  title: 'What is Nostr?',
  tagIds: ['nostr', 'decentralized-networks', 'cryptography'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <ArticleSection title="In a Nutshell">
        <p>
          Nostr is an open protocol for decentralized social apps. Your identity is just a
          cryptographic key—no company controls your account. Apps publish signed messages to relay
          servers, and you can switch clients without losing your identity or followers.
        </p>
      </ArticleSection>

      <ArticleSection title="How it Works">
        <p>
          <strong>Nostr</strong> ("Notes and Other Stuff Transmitted by Relays") lets participants
          publish <ArticleLink slug="cryptographic-signatures">signed events</ArticleLink> to relay
          servers. Unlike a blockchain, there is no global consensus or proof-of-work—each relay
          decides what it stores, and users choose which relays to use.
        </p>
        <p>
          Events are signed with a{' '}
          <ArticleLink slug="what-is-secp256k1">secp256k1</ArticleLink> key pair. Your public key
          (often shown as "npub") is your portable identity. Note: Nostr keys are <em>not</em>{' '}
          Bitcoin addresses—the curve is shared, but the systems are separate.
        </p>
        <p>
          <strong>Relays</strong> are servers that accept and return events over WebSockets.{' '}
          <strong>Clients</strong> are apps that compose, sign, and display events. Because identity
          is just a key, you can switch clients freely.
        </p>
      </ArticleSection>

      <ArticleSection title="How it Really Works">
        <p>
          The atomic unit is an <strong>event</strong>: a structured object with a kind, content,
          tags, timestamp, and cryptographic signature. <strong>NIPs</strong> (Nostr Implementation
          Possibilities) extend the protocol with encrypted DMs, long-form articles, and wallet
          integration.
        </p>
        <p>
          When people "zap" posts, funds move via{' '}
          <ArticleLink slug="the-lightning-network">Lightning</ArticleLink>, often coordinated
          through <ArticleLink slug="nostr-wallet-connect">Nostr Wallet Connect (NWC)</ArticleLink>.
          Public notes are visible to relay readers; metadata (who talks to whom) can be observed by
          operators.
        </p>
      </ArticleSection>

      <ArticleSection title="How Bitboard Wallet Handles This">
        <p>
          Bitboard uses <strong>Nostr Wallet Connect</strong> so you can link a Lightning wallet
          that speaks NIP-47 without Bitboard holding your Lightning keys. Understanding Nostr helps
          you reason about what the connection string does and why relays appear in the URI.
        </p>
      </ArticleSection>

      <ArticleSection title="Deep Dive Resources">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <a
              href="https://nostr.com/"
              className="text-primary underline-offset-4 hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              nostr.com
            </a>{' '}
            — Official protocol hub
          </li>
          <li>NIPs are listed in the Nostr documentation repository on GitHub</li>
        </ul>
      </ArticleSection>
    </div>
  ),
}
