import { ArticleLink } from '@/lib/library/article-shared'
import { ARKADE_LIBRARY_SLUGS } from '@/lib/arkade/arkade-infomode'
import {
  ARKADE_INFOMODE_CONTENT_CLASS,
  ArkadeInfomodeHeading,
  ArkadeInfomodeParagraph,
} from '@/components/arkade/infomode/arkade-infomode-content-shared'

export function ArkadeUnrollInfomodeContent() {
  return (
    <div className={ARKADE_INFOMODE_CONTENT_CLASS}>
      <ArkadeInfomodeHeading>Unroll</ArkadeInfomodeHeading>
      <ArkadeInfomodeParagraph>
        Unrolling publishes a chain of on-chain transactions that unwind your VTXO without operator
        help. Each step costs miner fees from the bumper wallet. After unroll finishes, wait for
        the CSV timelock, then complete the exit to your bc1 address.
      </ArkadeInfomodeParagraph>
      <ArkadeInfomodeParagraph>
        <ArticleLink slug={ARKADE_LIBRARY_SLUGS.exits}>Exiting Arkade to on-chain</ArticleLink>
      </ArkadeInfomodeParagraph>
    </div>
  )
}
