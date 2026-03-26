import { ArticleLink, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'soft-forks-hard-forks-and-backward-compatibility',
  title: 'Soft forks, hard forks, and backward compatibility',
  tagIds: ['soft-forks', 'hard-forks', 'bitcoin'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <p>
        Bitcoin&apos;s rules are enforced by software that everyone runs. When developers propose a
        change, it matters whether old and new versions of the software can still agree on which
        blocks and transactions are valid.
      </p>
      <p>
        A <strong>soft fork</strong> tightens or extends the rules in a backward-compatible way:
        blocks that obey the new, stricter rules are still valid under the old rules (or old nodes
        treat them as acceptable). Nodes that have not upgraded may not fully understand new
        features, but they still follow the same chain. Upgrades such as{' '}
        <ArticleLink slug="segwit">SegWit</ArticleLink> and <ArticleLink slug="taproot">Taproot</ArticleLink>{' '}
        were deployed as soft forks.
      </p>
      <p>
        A <strong>hard fork</strong> is a breaking change: old and new rules disagree on what is
        valid. Unless everyone coordinates, the network can split into two separate chains with
        separate histories and assets after the fork.{' '}
        <ArticleLink slug="bitcoin-cash">Bitcoin Cash</ArticleLink> is an example of a contentious
        split where two communities continued with different rule sets.
      </p>
      <p>
        Standards for proposing changes are documented in BIPs; see{' '}
        <ArticleLink slug="what-is-a-bip">What is BIP?</ArticleLink>. For the base layer&apos;s
        consensus model, see <ArticleLink slug="bitcoin">Bitcoin</ArticleLink>.
      </p>
    </div>
  ),
}
