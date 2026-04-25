import { ArticleLink, ArticleSection, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'soft-forks-hard-forks-and-backward-compatibility',
  title: 'Soft forks, hard forks, and backward compatibility',
  tagIds: ['soft-forks', 'hard-forks', 'bitcoin'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <ArticleSection title="In a Nutshell">
        <p>
          A soft fork is like tightening the dress code—old outfits still work, but new ones must
          meet stricter rules. A hard fork is like splitting a club into two venues with different
          rules—members must choose which to attend.
        </p>
      </ArticleSection>

      <ArticleSection title="How it Works">
        <p>
          Bitcoin&apos;s rules are enforced by software everyone runs. When developers propose a
          change, it matters whether old and new versions can still agree on which blocks are valid.
        </p>
        <p>
          A <strong>soft fork</strong> tightens rules in a backward-compatible way: new blocks are
          valid under old rules. Nodes that have not upgraded still follow the same chain. Upgrades
          like <ArticleLink slug="segwit">SegWit</ArticleLink> and{' '}
          <ArticleLink slug="taproot">Taproot</ArticleLink> were soft forks.
        </p>
        <p>
          A <strong>hard fork</strong> is a breaking change: old and new rules disagree. Unless
          everyone coordinates, the network splits.{' '}
          <ArticleLink slug="bitcoin-cash">Bitcoin Cash</ArticleLink> is an example of a contentious
          split.
        </p>
      </ArticleSection>

      <ArticleSection title="How it Really Works">
        <p>
          Soft forks work by making previously valid things invalid (tighter rules), which old nodes
          see as &quot;weird but acceptable.&quot; Hard forks make previously invalid things valid,
          which old nodes reject—causing a permanent split unless everyone upgrades.
        </p>
        <p>
          Standards for proposing changes are documented in BIPs; see{' '}
          <ArticleLink slug="what-is-a-bip">What is BIP?</ArticleLink>. For the base layer&apos;s
          consensus model, see <ArticleLink slug="bitcoin">Bitcoin</ArticleLink>.
        </p>
      </ArticleSection>
    </div>
  ),
}
