import { useMemo, useState, type ReactNode } from 'react';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { useReducedMotion } from 'motion/react';
import { MatrixBackground } from '@/components/MatrixBackground';
import { Button } from '@/components/ui/button';
import { landingPageLink } from '@/src/landing-page-links';
import {
  detectInstallGuidePlatform,
  INSTALL_PLATFORM_OPTIONS,
  type InstallGuidePlatform,
} from '@/src/lib/detect-install-platform';

function InstructionBlock({
  title,
  children,
  emphasized,
}: {
  title: string;
  children: ReactNode;
  emphasized?: boolean;
}) {
  return (
    <section
      className={`rounded-none border p-6 text-left ${
        emphasized ? 'border-matrix bg-matrix/10' : 'border-matrix/40 bg-matrix/5'
      }`}
    >
      <h2 className="text-lg font-bold uppercase tracking-tight text-matrix mb-4">{title}</h2>
      <div className="text-sm text-matrix/90 leading-relaxed space-y-3 font-mono">{children}</div>
    </section>
  );
}

function PlatformInstructions({ platform, appUrl }: { platform: InstallGuidePlatform; appUrl: string }) {
  const openAppLine = (
    <p>
      Open the app at{' '}
      <a href={appUrl} className="text-white underline underline-offset-2 hover:text-matrix">
        {appUrl}
      </a>{' '}
      in the browser this device uses for installation (usually Safari on iOS, Chrome on Android).
    </p>
  );

  switch (platform) {
    case 'ios':
      return (
        <InstructionBlock title="iPhone or iPad (Safari)" emphasized>
          {openAppLine}
          <ol className="list-decimal pl-5 space-y-2">
            <li>
              Tap the <strong className="text-white">Share</strong> button (square with an arrow).
            </li>
            <li>
              Scroll down and tap <strong className="text-white">Add to Home Screen</strong>.
            </li>
            <li>
              Confirm with <strong className="text-white">Add</strong>. The Bitboard icon appears on your home screen.
            </li>
          </ol>
          <p className="text-matrix/80 text-xs">
            Apple does not allow websites to trigger “Add to Home Screen” automatically; this must be done in Safari.
          </p>
        </InstructionBlock>
      );
    case 'android':
      return (
        <InstructionBlock title="Android (Chrome or Chromium-based browser)" emphasized>
          {openAppLine}
          <ol className="list-decimal pl-5 space-y-2">
            <li>
              When the browser offers it, tap <strong className="text-white">Install</strong> or{' '}
              <strong className="text-white">Add to Home screen</strong>.
            </li>
            <li>
              Or open the menu (<strong className="text-white">⋮</strong>) and choose{' '}
              <strong className="text-white">Install app</strong> or <strong className="text-white">Add to Home screen</strong>.
            </li>
          </ol>
          <p className="text-matrix/80 text-xs">
            Exact labels vary by manufacturer (Samsung, etc.); the option is usually next to the address bar or in the menu.
          </p>
        </InstructionBlock>
      );
    case 'desktop-chromium':
      return (
        <InstructionBlock title="Chrome, Edge, or Brave on desktop" emphasized>
          {openAppLine}
          <ol className="list-decimal pl-5 space-y-2">
            <li>
              Look for an <strong className="text-white">install</strong> icon in the right side of the address bar, or
              open the browser menu.
            </li>
            <li>
              Choose <strong className="text-white">Install Bitboard Wallet</strong> (or similar) and confirm.
            </li>
          </ol>
          <p className="text-matrix/80 text-xs">
            Installed PWAs open in their own window without the full browser toolbar.
          </p>
        </InstructionBlock>
      );
    case 'desktop-safari':
      return (
        <InstructionBlock title="Safari on macOS" emphasized>
          {openAppLine}
          <p>
            Safari’s PWA support depends on your macOS version. Try{' '}
            <strong className="text-white">File → Add to Dock</strong> when available, or use the{' '}
            <strong className="text-white">Share</strong> menu and look for options to add the site to the Dock or home
            screen.
          </p>
          <p className="text-matrix/80 text-xs">
            For the most predictable install flow on desktop, many users use Chrome or Edge for this site.
          </p>
        </InstructionBlock>
      );
    case 'desktop-firefox':
      return (
        <InstructionBlock title="Firefox on desktop" emphasized>
          {openAppLine}
          <p>
            Firefox’s support for installing PWAs varies by platform and version. If you do not see an install option, open
            the app in <strong className="text-white">Chrome</strong> or <strong className="text-white">Edge</strong> and
            use their install prompt in the address bar.
          </p>
        </InstructionBlock>
      );
    default:
      return (
        <InstructionBlock title="General steps" emphasized>
          {openAppLine}
          <p>
            On a phone or tablet, use the browser’s <strong className="text-white">Share</strong> or{' '}
            <strong className="text-white">menu</strong> and look for <strong className="text-white">Add to Home Screen</strong>,{' '}
            <strong className="text-white">Install</strong>, or <strong className="text-white">Install app</strong>.
          </p>
          <p>
            On a computer, use Chrome or Edge and look for an <strong className="text-white">install</strong> icon in the
            address bar.
          </p>
        </InstructionBlock>
      );
  }
}

export function PwaInstallPage() {
  const prefersReducedMotion = useReducedMotion();
  const appUrl = landingPageLink('app');

  const detected = useMemo(() => detectInstallGuidePlatform(), []);
  const [selected, setSelected] = useState<InstallGuidePlatform>(detected);

  const homeHref = '/';

  return (
    <div className="min-h-screen text-white font-sans selection:bg-matrix selection:text-black relative overflow-x-hidden">
      <MatrixBackground reducedMotion={prefersReducedMotion ?? false} />

      <div className="relative z-10 max-w-2xl mx-auto px-6 py-10 md:py-16">
        <a
          href={homeHref}
          className="inline-flex items-center gap-2 text-matrix hover:text-matrix/80 font-mono text-sm mb-10 uppercase tracking-widest"
        >
          <ArrowLeft size={18} />
          Back to home
        </a>

        <h1 className="text-4xl md:text-5xl font-bold tracking-tighter mb-2">
          <span className="text-bitcoin">Install Bit</span>
          <span className="text-matrix">board Wallet</span>
        </h1>
        <p className="text-matrix/90 font-mono text-sm mb-8 max-w-xl">
          Install the app for a home screen icon and a focused window. Detection below matches your current device when
          possible; you can switch if it looks wrong.
        </p>

        <div className="mb-8 space-y-2">
          <label htmlFor="install-platform" className="block text-xs uppercase tracking-widest text-matrix/80 font-mono">
            Show instructions for
          </label>
          <select
            id="install-platform"
            value={selected}
            onChange={(e) => setSelected(e.target.value as InstallGuidePlatform)}
            className="w-full max-w-md bg-black/60 border border-matrix/50 text-matrix font-mono text-sm px-3 py-2 rounded-none focus:outline-none focus:ring-2 focus:ring-matrix/60"
          >
            {INSTALL_PLATFORM_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
                {opt.value === detected ? ' (detected)' : ''}
              </option>
            ))}
          </select>
        </div>

        {appUrl ? (
          <PlatformInstructions platform={selected} appUrl={appUrl} />
        ) : (
          <InstructionBlock title="App URL not configured" emphasized>
            <p>The public app URL is not set in this build. Configure it in the landing page links, then rebuild.</p>
          </InstructionBlock>
        )}

        <div className="mt-10 flex flex-col sm:flex-row gap-4">
          {appUrl ? (
            <a href={appUrl} rel="noopener noreferrer">
              <Button
                size="lg"
                className="bg-matrix text-black hover:bg-matrix/80 font-bold rounded-none px-8 h-14 text-lg w-full sm:w-auto"
              >
                Open app in browser <ExternalLink className="ml-2 inline" size={18} />
              </Button>
            </a>
          ) : null}
        </div>
      </div>
    </div>
  );
}
