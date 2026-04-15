import { Globe, ExternalLink } from 'lucide-react';
import { GitHubMark } from '@/src/GitHubMark';
import { FooterOutboundLink } from './FooterOutboundLink';

interface SiteFooterProps {
  githubUrl: string;
  websiteUrl: string;
  blogUrl: string;
}

export function SiteFooter({ githubUrl, websiteUrl, blogUrl }: SiteFooterProps) {
  return (
    <footer className="border-t border-white/10 py-12 px-6 mt-20">
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-8">
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
    </footer>
  );
}
