import { ArticleLink } from '@/lib/library/article-shared'
import { ARKADE_LIBRARY_SLUGS } from '@/lib/arkade/arkade-infomode'
import {
  INFOMODE_CONTENT_CLASS,
  InfomodeHeading,
  InfomodeParagraph,
} from '@/components/infomode/InfomodeContentShared'

export function ArkadeExitOperatorFeesInfomodeContent() {
  return (
    <div className={INFOMODE_CONTENT_CLASS}>
      <InfomodeHeading>Operator fees (estimate)</InfomodeHeading>
      <InfomodeParagraph>
        The Arkade operator charges for settling your exit on-chain. The settlement fee rate and
        intent fees come from the operator&apos;s policy. The estimate shows what you may pay and
        what could arrive at your bc1 address—actual fees can differ slightly.
      </InfomodeParagraph>
      <InfomodeParagraph>
        <ArticleLink slug={ARKADE_LIBRARY_SLUGS.exits}>Exiting Arkade to on-chain</ArticleLink>
      </InfomodeParagraph>
    </div>
  )
}
