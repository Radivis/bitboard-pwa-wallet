import { ArticleLink, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'what-is-nostr',
  title: 'What is Nostr?',
  tagIds: ['nostr', 'decentralized-networks', 'cryptography'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <p>
        <strong>Nostr</strong> (“Notes and Other Stuff Transmitted by Relays”) is an open protocol
        for building censorship-resistant applications on top of a very small set of rules. The
        core idea is simple: participants publish <strong>signed events</strong> (see{' '}
        <ArticleLink slug="cryptographic-signatures">Cryptographic signatures</ArticleLink>) to optional
        relay servers; anyone can write a client that reads and writes those events. There is no single
        company API, no one blockchain everyone must agree on, and no mandatory global state
        machine—only messages that follow the format and cryptography defined in the protocol.
      </p>
      <p>
        Unlike a <strong>blockchain</strong>, Nostr does not require proof-of-work or a shared ledger
        to order the entire world’s activity. Each relay decides what it stores and forwards; users
        (or their clients) choose which relays to use. That makes the system easy to implement and
        cheap to run, at the cost of each user thinking a bit about <em>where</em> their data lives
        and which relays they trust for availability. For contrast with Bitcoin’s global consensus,
        see <ArticleLink slug="bitcoin">Bitcoin</ArticleLink> and{' '}
        <ArticleLink slug="what-is-a-peer-to-peer-network">What is a peer to peer network?</ArticleLink>
        .
      </p>

      <h3 className="text-lg font-semibold text-black dark:text-white">Events and identity</h3>
      <p>
        The atomic unit in Nostr is an <strong>event</strong>: a structured object with a{' '}
        <strong>kind</strong> (a number that says what type of message it is), optional{' '}
        <strong>content</strong>, <strong>tags</strong> for metadata, a <strong>created_at</strong>{' '}
        timestamp, and cryptographic fields. Events are signed with a{' '}
        <ArticleLink slug="what-is-secp256k1">secp256k1</ArticleLink> key pair. Your public key (often
        shown in “npub” form) is your
        portable identity: the same key can post to many relays and clients without a central account
        database. This is the same elliptic curve family Bitcoin uses for keys, but Nostr keys are{' '}
        <em>not</em> Bitcoin addresses—you do not automatically control on-chain funds just because
        you have a Nostr key. For more on keys in Bitcoin, see{' '}
        <ArticleLink slug="secret-and-public-keys-in-bitcoin">
          Secret and public keys in Bitcoin
        </ArticleLink>
        .
      </p>
      <p>
        Events are identified by a deterministic <strong>id</strong> and carry a <strong>sig</strong>{' '}
        so relays and clients can verify that the author really produced the message. Optional
        protocols (often called <strong>NIPs</strong>—Nostr Implementation Possibilities) extend this
        core with things like encrypted direct messages, long-form articles, file metadata, and—
        importantly for wallets—how apps negotiate Lightning payments.
      </p>

      <h3 className="text-lg font-semibold text-black dark:text-white">Relays and clients</h3>
      <p>
        A <strong>relay</strong> is a server that accepts and returns events over WebSockets (and
        sometimes HTTP). Relays are <strong>not</strong> trusted to enforce “truth” about money or
        consensus; they are mostly dumb pipes plus storage. A <strong>client</strong> is the app you
        use: it composes events, signs them, subscribes to filters, and displays a feed or inbox.
        Because identity is just a key, you can switch clients without a platform migration—another
        contrast with closed social networks.
      </p>
      <p>
        This architecture is deliberately minimal so many different apps can coexist: microblogging,
        chat, marketplaces, podcasting, and tipping flows can all use the same identity layer. The
        tradeoff is <strong>spam and abuse</strong>: without a chain, spam filtering is left to
        relays, clients, and communities—not solved by protocol magic.
      </p>

      <h3 className="text-lg font-semibold text-black dark:text-white">Lightning and “zaps”</h3>
      <p>
        Nostr does not move bitcoin on its own. When people “zap” posts or pay in Nostr apps, the
        actual movement of funds happens on the <strong>Lightning Network</strong> (or sometimes
        on-chain), coordinated by invoices and wallet software. Nostr provides the social graph and
        messaging context; Lightning provides instant, small payments. See{' '}
        <ArticleLink slug="the-lightning-network">The Lightning network</ArticleLink> for how
        channels and routing work. Wallet integration for apps is often done via{' '}
        <ArticleLink slug="nostr-wallet-connect">Nostr Wallet Connect (NWC)</ArticleLink>, which
        lets a Nostr-capable app ask an external Lightning wallet to pay or create invoices over the
        same relay ecosystem.
      </p>

      <h3 className="text-lg font-semibold text-black dark:text-white">Privacy and expectations</h3>
      <p>
        Public notes are visible to anyone who reads the relays that store them. Encrypted formats
        exist for DMs and some content, but users should assume <strong>metadata</strong> (who talks
        to whom, when, and via which relay) can be observed by relay operators and network
        observers. Nostr is a tool for <strong>open publication and interoperability</strong>, not
        a complete anonymity system by default.
      </p>

      <h3 className="text-lg font-semibold text-black dark:text-white">Why it matters for Bitboard</h3>
      <p>
        Bitboard uses <strong>Nostr Wallet Connect</strong> so you can link a Lightning wallet that
        speaks NIP-47 without Bitboard holding your Lightning keys. Understanding Nostr at a high
        level helps you reason about what the connection string does and why relays appear in the
        URI. For the wallet side of that story, read{' '}
        <ArticleLink slug="nostr-wallet-connect">Nostr Wallet Connect (NWC)</ArticleLink>.
      </p>
      <p>
        Official protocol hub:{' '}
        <a
          href="https://nostr.com/"
          className="text-primary underline-offset-4 hover:underline"
          target="_blank"
          rel="noopener noreferrer"
        >
          nostr.com
        </a>
        . NIPs are listed in the Nostr documentation repository on GitHub.
      </p>
    </div>
  ),
}
