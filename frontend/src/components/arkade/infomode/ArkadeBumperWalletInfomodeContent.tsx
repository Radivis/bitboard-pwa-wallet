import { ArticleLink } from '@/lib/library/article-shared'
import { ARKADE_LIBRARY_SLUGS } from '@/lib/arkade/arkade-infomode'
import {
  ARKADE_INFOMODE_CONTENT_CLASS,
  ArkadeInfomodeHeading,
  ArkadeInfomodeParagraph,
} from '@/components/arkade/infomode/arkade-infomode-content-shared'

export function ArkadeBumperWalletInfomodeContent() {
  return (
    <div className={ARKADE_INFOMODE_CONTENT_CLASS}>
      <ArkadeInfomodeHeading>Bumper wallet (P2A fees)</ArkadeInfomodeHeading>
      <ArkadeInfomodeParagraph>
        A small on-chain wallet used only to pay miner fees for unilateral exit steps. Fund it by
        sending a little Bitcoin from your regular on-chain balance if the balance shown is too low.
      </ArkadeInfomodeParagraph>
      <ArkadeInfomodeParagraph>
        <ArticleLink slug={ARKADE_LIBRARY_SLUGS.exits}>Exiting Arkade to on-chain</ArticleLink>
      </ArkadeInfomodeParagraph>
    </div>
  )
}
