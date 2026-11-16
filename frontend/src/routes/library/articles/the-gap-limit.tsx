import { ArticleLink, ArticleSection, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'the-gap-limit',
  title: 'The gap limit',
  tagIds: ['wallets', 'bitcoin', 'standards'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <ArticleSection title="In a Nutshell">
        <p>
          A wallet does not download the whole chain to find your coins. It asks an indexer about
          addresses in order and stops after a run of unused ones. That stop is the{' '}
          <strong>gap limit</strong>, usually 20. An address revealed past it can hold coins that a
          normal restore will not see. The coins are not destroyed.
        </p>
      </ArticleSection>

      <ArticleSection title="How it Works">
        <p>
          A <ArticleLink slug="what-are-hd-wallets-and-how-do-they-work">HD wallet</ArticleLink>{' '}
          derives receiving addresses as index 0, 1, 2, and so on. To learn which of them have been
          paid, a typical wallet asks <ArticleLink slug="esplora-privacy">Esplora</ArticleLink> for
          each address&apos;s transaction history — one request per address — and merges the answers
          locally.
        </p>
        <p>
          An address counts as used when any transaction pays it. That includes a payment already
          spent, and a payment still in the mempool. Empty history counts as unused. A used address
          resets the gap counter. After 20 unused addresses in a row, the scan stops. It does query
          those 20. It does not query the next one.
        </p>
        <p>
          Only the unused run after the latest paid address matters. Unused holes behind that
          payment do not use up the limit. If address 4 was paid, a gap-20 scan still looks at
          addresses 5 through 24. Address 25 is the first one it skips. With no payment yet, it
          looks at addresses 0 through 19 and skips 20.
        </p>
      </ArticleSection>

      <ArticleSection title="How it Really Works">
        <p>
          The limit exists so recovery can finish. A seed can derive billions of addresses, and
          asking about all of them would never end. The cost is that revealing many addresses
          before they are paid walks you off the end of the lookahead. Someone can still pay the
          later address. A restore that has only the seed, and most other wallets at the usual gap
          of 20, will not look that far, so the balance looks missing.
        </p>
        <p>Those coins can still be found in a few situations:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            The wallet that revealed the address, or a backup of that wallet&apos;s data rather than
            the seed alone, already knows the script. Its next sync asks about the addresses it
            remembers, including ones past the gap.
          </li>
          <li>
            A wallet that lets you raise the gap limit, then scan again, will query further and can
            pick the coins up. Some software, including Bitcoin Core, looks much further ahead than
            20 by default.
          </li>
          <li>
            A payment to an address the scan does reach moves the window forward. If address 10 is
            paid, the next 20 addresses become visible too, including ones that used to sit past
            the old limit.
          </li>
          <li>
            A payment that lands only past the limit does not pull other wallets forward. They never
            query that address, so they never learn to keep going.
          </li>
        </ul>
        <p>
          A dropped or reorged payment can move the latest used address backward. Addresses that
          looked safe can end up past the limit without you generating anything new. Receive
          addresses and change addresses are separate chains, each with its own gap. Generating a
          fresh address for privacy is still the right habit. See{' '}
          <ArticleLink slug="address-reuse-and-deanonymization">
            Address reuse and deanonymization
          </ArticleLink>
          .
        </p>
      </ArticleSection>
    </div>
  ),
}
