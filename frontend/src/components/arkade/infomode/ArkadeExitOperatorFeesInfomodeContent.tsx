import { ArticleLink } from '@/lib/library/article-shared'
import { ARKADE_LIBRARY_SLUGS } from '@/lib/arkade/arkade-infomode'
import {
  ARKADE_INFOMODE_CONTENT_CLASS,
  ArkadeInfomodeHeading,
  ArkadeInfomodeParagraph,
} from '@/components/arkade/infomode/arkade-infomode-content-shared'

export function ArkadeExitOperatorFeesInfomodeContent() {
  return (
    <div className={ARKADE_INFOMODE_CONTENT_CLASS}>
      <ArkadeInfomodeHeading>Operator fees (estimate)</ArkadeInfomodeHeading>
      <ArkadeInfomodeParagraph>
        The Arkade operator charges for settling your exit on-chain. The settlement fee rate and
        intent fees come from the operator&apos;s policy. The estimate shows what you may pay and
        what could arrive at your bc1 address—actual fees can differ slightly.
      </ArkadeInfomodeParagraph>
      <ArkadeInfomodeParagraph>
        <ArticleLink slug={ARKADE_LIBRARY_SLUGS.exits}>Exiting Arkade to on-chain</ArticleLink>
      </ArkadeInfomodeParagraph>
    </div>
  )
}
