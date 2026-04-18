import { Globe, ExternalLink } from 'lucide-react';
import { GitHubMark } from '@/src/GitHubMark';
import { FooterOutboundLink } from './FooterOutboundLink';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useLegalNoticeDisplay } from '@legal-notice-display';
import {
  LEGAL_NOTICE_FLAG_DE,
  LEGAL_NOTICE_FLAG_EN,
} from '@legal-locale';

/** Footer sits on dark bg; theme `default` button can be white-on-white — use explicit contrast. */
function legalLocaleSwitcherButtonClass(active: boolean): string {
  return cn(
    'gap-1.5 border shadow-none',
    active
      ? 'border-white/50 bg-white/15 text-white hover:bg-white/20 hover:text-white'
      : 'border-white/25 bg-transparent text-gray-300 hover:border-white/40 hover:bg-white/10 hover:text-white',
  );
}

interface SiteFooterProps {
  githubUrl: string;
  websiteUrl: string;
  blogUrl: string;
}

export function SiteFooter({ githubUrl, websiteUrl, blogUrl }: SiteFooterProps) {
  const legal = useLegalNoticeDisplay();

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

        {legal.visible ? (
          <div className="border-t border-white/10 pt-6 text-left w-full">
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
              <h2 className="text-sm font-semibold text-gray-300 shrink-0">{legal.title}</h2>
              {legal.showSwitcher ? (
                <div
                  className="flex flex-wrap gap-2"
                  role="group"
                  aria-label="Legal notice language"
                >
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className={legalLocaleSwitcherButtonClass(
                      legal.activeLocale === 'de',
                    )}
                    onClick={() => legal.setLocale('de')}
                    aria-pressed={legal.activeLocale === 'de'}
                  >
                    <span aria-hidden>{LEGAL_NOTICE_FLAG_DE}</span>
                    Deutsch
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className={legalLocaleSwitcherButtonClass(
                      legal.activeLocale === 'en',
                    )}
                    onClick={() => legal.setLocale('en')}
                    aria-pressed={legal.activeLocale === 'en'}
                  >
                    <span aria-hidden>{LEGAL_NOTICE_FLAG_EN}</span>
                    English
                  </Button>
                </div>
              ) : null}
            </div>
            <p className="text-gray-500 text-sm whitespace-pre-wrap max-w-3xl mt-2">{legal.body}</p>
          </div>
        ) : null}
      </div>
    </footer>
  );
}
