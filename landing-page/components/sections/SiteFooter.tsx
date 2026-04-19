import { Globe, ExternalLink } from 'lucide-react';
import { GitHubMark } from '@/src/GitHubMark';
import { FooterOutboundLink } from './FooterOutboundLink';
import { LegalLocaleSwitcherLanding } from '@/src/components/LegalLocaleSwitcherLanding';
import { LegalNoticeDe } from '@common/legal/LegalNoticeDe';
import { LegalNoticeEn } from '@common/legal/LegalNoticeEn';
import {
  LEGAL_NOTICE_TITLE_DE,
  LEGAL_NOTICE_TITLE_EN,
  PRIVACY_PAGE_TITLE_DE,
  PRIVACY_PAGE_TITLE_EN,
  useLegalLocale,
} from '@legal-locale';

interface SiteFooterProps {
  githubUrl: string;
  websiteUrl: string;
  blogUrl: string;
}

export function SiteFooter({ githubUrl, websiteUrl, blogUrl }: SiteFooterProps) {
  const { locale, setLocale } = useLegalLocale();
  const legalTitle = locale === 'de' ? LEGAL_NOTICE_TITLE_DE : LEGAL_NOTICE_TITLE_EN;
  const privacyLinkLabel =
    locale === 'de' ? PRIVACY_PAGE_TITLE_DE : PRIVACY_PAGE_TITLE_EN;

  return (
    <footer className="border-t border-white/10 py-12 px-6 mt-20">
      <div className="max-w-6xl mx-auto flex flex-col gap-6">
        <div className="flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="text-center md:text-left">
            <div className="text-2xl font-bold mb-2">
          <span className="text-bitcoin">BIT</span><span className="text-matrix">BOARD WALLET</span>
            </div>
            <p className="text-gray-500 text-sm">from zero to clarity</p>
          </div>

          <div className="flex gap-6">
            <FooterOutboundLink href={githubUrl} label="GitHub repository">
              <GitHubMark />
            </FooterOutboundLink>
            <FooterOutboundLink href={websiteUrl} label="Website">
              <Globe size={20} />
            </FooterOutboundLink>
            <FooterOutboundLink href={blogUrl} label="Blog">
              <ExternalLink size={20} />
            </FooterOutboundLink>
          </div>

          <div className="text-gray-500 text-[10px] uppercase tracking-widest">
          Developed by Michael Hrenka • MIT LICENSE • FOSS
          </div>
        </div>

        <div className="text-center md:text-left">
          <a
            href="/privacy.html"
            className="text-sm text-gray-400 underline underline-offset-4 hover:text-gray-200"
          >
            {privacyLinkLabel}
          </a>
        </div>

        <div className="border-t border-white/10 pt-6 text-left w-full">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
            <h2 className="text-sm font-semibold text-gray-300 shrink-0">{legalTitle}</h2>
            <LegalLocaleSwitcherLanding
              activeLocale={locale}
              onLocaleChange={setLocale}
              ariaLabel="Legal notice language"
            />
          </div>
          <div className="max-w-3xl mt-2">
            {locale === 'de' ? (
              <LegalNoticeDe surface="landing" />
            ) : (
              <LegalNoticeEn surface="landing" />
            )}
          </div>
        </div>
      </div>
    </footer>
  );
}
