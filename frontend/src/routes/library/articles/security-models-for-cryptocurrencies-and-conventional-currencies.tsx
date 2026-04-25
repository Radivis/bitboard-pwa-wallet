import { ArticleLink, ArticleSection, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'security-models-for-cryptocurrencies-and-conventional-currencies',
  title: 'Security models for cryptocurrencies and conventional currencies',
  tagIds: ['security', 'cryptocurrencies', 'wallets', 'bitcoin'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <ArticleSection title="In a Nutshell">
        <p>
          How you secure bitcoin rhymes with how you secure cash. You can hold it yourself (like
          keeping bills in a safe) or let someone else hold it (like a bank account). Both options
          exist for traditional money and crypto—the trade-offs are similar.
        </p>
      </ArticleSection>

      <ArticleSection title="How it Works">
        <p>
          The main split is whether <strong>you</strong> hold the asset (non-custodial) or{' '}
          <strong>someone else</strong> holds it for you (custodial). Pair that with conventional
          currency or cryptocurrency, and you get four patterns:
        </p>
        <p>
          <strong>Non-custodial, conventional:</strong> Physical cash—you keep notes and coins hidden
          at home, in a safe, or in your pocket. If lost or stolen, they are gone.
        </p>
        <p>
          <strong>Non-custodial, crypto:</strong> You hold{' '}
          <ArticleLink slug="secret-and-public-keys-in-bitcoin">keys</ArticleLink> yourself via a{' '}
          <ArticleLink slug="what-is-a-wallet">wallet app</ArticleLink> or{' '}
          <ArticleLink slug="what-is-a-hardware-wallet">hardware wallet</ArticleLink>. Like cash, if
          you lose the secrets, funds can be gone.
        </p>
      </ArticleSection>

      <ArticleSection title="How it Really Works">
        <p>
          <strong>Custodial, conventional:</strong> You rely on a <strong>bank</strong> to store
          balances and process payments. You trust their operations, security, and solvency.
        </p>
        <p>
          <strong>Custodial, crypto:</strong> An <strong>exchange or custodian</strong> holds keys on
          your behalf. You trust them to keep assets safe—see{' '}
          <ArticleLink slug="not-your-keys-not-your-coins-explained">
            &quot;Not your keys, not your coins&quot; explained
          </ArticleLink>
          .
        </p>
        <p>
          Cryptocurrency does not invent a wholly new pattern: it maps to{' '}
          <strong>cash-like self-custody</strong> versus <strong>institutional custody</strong>,
          whether the rails are paper or blockchain. For day-to-day habits, see{' '}
          <ArticleLink slug="basics-for-keeping-keys-safe">
            Basics for keeping your keys safe
          </ArticleLink>
          .
        </p>
      </ArticleSection>
    </div>
  ),
}
