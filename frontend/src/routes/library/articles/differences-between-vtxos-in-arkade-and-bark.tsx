import {
  ARTICLE_BODY_CLASS,
  ArticleLink,
  ArticleSection,
} from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'
import { ARKADE_LIBRARY_SLUGS } from '@/lib/arkade/arkade-infomode'

export const article: LibraryArticle = {
  slug: 'differences-between-vtxos-in-arkade-and-bark',
  title: 'Differences between VTXOs in Arkade and Bark',
  tagIds: ['bitcoin', 'wallets', 'l2'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <ArticleSection title="In a Nutshell">
        <p>
          Arkade and Bark both call an off-chain Bitcoin balance unit a <strong>VTXO</strong>. The
          coins are not the same. A Bark VTXO always has a single parent chain. An Arkade VTXO can
          be the child of several coins at once.
        </p>
      </ArticleSection>

      <ArticleSection title="Same word, different coin">
        <p>
          In both protocols a VTXO is a signed claim on Bitcoin that an operator helps you move
          without a new on-chain transaction for every payment. You can still fall back to the
          chain if the operator stops cooperating. A Bark coin cannot be spent as an Arkade coin,
          and an Arkade coin cannot be spent as a Bark coin.
        </p>
        <p>
          Expiry, refresh, and exit exist on both sides. What changes is how a new coin remembers
          the coins it came from.
        </p>
      </ArticleSection>

      <ArticleSection title="Bark keeps one parent">
        <p>
          Every Bark VTXO stores one path from a single on-chain anchor down to itself. Each
          transaction on that path spends exactly one earlier output: the continuation of the
          previous step. Other outputs of the same transaction belong to other coins.
        </p>
        <p>
          A Bark <strong>round</strong> can take several of your coins and hand you fewer new ones.
          The coins you put in are forfeited. Each coin you receive starts a fresh path at the
          round&apos;s on-chain output. The old paths stop there. They are not parents of the new
          coin.
        </p>
        <p>
          An out-of-round Bark payment (<strong>Arkoor</strong>) spends one coin at a time along
          that coin&apos;s own path. When a payment draws on several coins, Bark cuts it into
          pieces that each fit one input. Each piece continues exactly one parent. A payment that
          looks like one amount can therefore land as several coins that share a destination,
          rather than as one consolidated coin.
        </p>
      </ArticleSection>

      <ArticleSection title="Arkade can join several parents">
        <p>
          An Arkade payment can spend several VTXOs and pay the combined amount as one new VTXO.
          Each spent coin is first spent by its own checkpoint transaction. The Ark transaction
          then takes every one of those checkpoint outputs as an input. The result is a single
          balance unit whose history includes every parent branch.
        </p>
        <p>
          Exiting that coin publishes each of those branches, then the Ark transaction that spends
          them together. See{' '}
          <ArticleLink slug={ARKADE_LIBRARY_SLUGS.checkpointTransactions}>
            Checkpoint transactions
          </ArticleLink>{' '}
          for why those checkpoints exist.
        </p>
      </ArticleSection>

      <ArticleSection title="Where the checkpoint sits">
        <p>
          Both protocols pre-sign checkpoints so the operator can reclaim coins when an exit is
          started and then abandoned. The shape differs with the parent rule.
        </p>
        <p>
          Bark builds one checkpoint for an input, with one output per destination of that input,
          and then a separate follow-up transaction for each of those outputs. Arkade builds one
          checkpoint per spent VTXO, and the following Ark transaction can spend all of those
          checkpoints in one step.
        </p>
      </ArticleSection>

      <ArticleSection title="Related topics">
        <p>
          For the Arkade coin itself, read{' '}
          <ArticleLink slug={ARKADE_LIBRARY_SLUGS.vtxo}>What is a VTXO?</ArticleLink>. For leaving
          Arkade, read{' '}
          <ArticleLink slug={ARKADE_LIBRARY_SLUGS.exits}>Exiting Arkade to on-chain</ArticleLink>.
        </p>
      </ArticleSection>

      <ArticleSection title="Note">
        <p>
          That parent rule is why the two exit graphs look different. A Bark exit only splits:
          coins can share a prefix and then diverge, and those paths do not join again. The graph
          is a tree. An Arkade exit can also merge: separate checkpoint branches are inputs of the
          same Ark transaction. The graph is a directed acyclic graph. One Arkade coin can depend
          on several earlier transactions that do not lie on a single line.
        </p>
      </ArticleSection>
    </div>
  ),
}
