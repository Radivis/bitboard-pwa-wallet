import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowLeftRight,
  BookOpen,
  Drama,
  Droplets,
  FlaskConical,
  GlobeLock,
  Handshake,
  House,
  Pickaxe,
  Settings,
  ToggleRight,
  Wallet,
} from 'lucide-react';
import { Section } from '@/components/Section';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

function joinAppUrl(appUrl: string, path: string): string {
  const base = appUrl.replace(/\/$/, '');
  return `${base}${path}`;
}

function NavChip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex border border-matrix/50 px-2 py-0.5 text-[10px] font-mono uppercase tracking-tight text-matrix">
      {children}
    </span>
  );
}

function NavHintSingle({ label }: { label: string }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      <NavChip>{label}</NavChip>
    </div>
  );
}

function NavHintPair({ left, right }: { left: string; right: string }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      <NavChip>{left}</NavChip>
      <NavChip>{right}</NavChip>
    </div>
  );
}

interface GetStartedSectionProps {
  appUrl: string;
}

type StepBase = {
  title: string;
  desc: string;
  icon: LucideIcon;
};

type StepSingle = StepBase & {
  kind: 'single';
  path: string;
  nav: { type: 'single'; label: string } | { type: 'pair'; left: string; right: string };
};

type StepDual = StepBase & {
  kind: 'dual';
  first: { path: string; left: string; right: string };
  second: { path: string; left: string; right: string };
};

const GET_STARTED_STEPS: (StepSingle | StepDual)[] = [
  {
    kind: 'single',
    title: 'Create a wallet',
    desc: 'Spin up a wallet on the Start screen. You can skip password and mnemonic backup for a fast first run.',
    icon: Wallet,
    path: '/setup',
    nav: { type: 'single', label: 'Setup' },
  },
  {
    kind: 'single',
    title: 'Get Testnet coins',
    desc: 'Use a faucet from Receive so you have coins to play with on Testnet.',
    icon: Droplets,
    path: '/wallet/receive',
    nav: { type: 'pair', left: 'Wallet', right: 'Receive' },
  },
  {
    kind: 'single',
    title: 'Visit the Lab',
    desc: 'Open the Lab while you wait for Testnet confirmations—no idle time.',
    icon: FlaskConical,
    path: '/lab',
    nav: { type: 'single', label: 'Lab' },
  },
  {
    kind: 'single',
    title: 'Mine blocks instantly',
    desc: 'Use Lab Blocks to mine the sandbox chain on demand.',
    icon: Pickaxe,
    path: '/lab/blocks',
    nav: { type: 'pair', left: 'Lab', right: 'Blocks' },
  },
  {
    kind: 'single',
    title: 'Create Lab entities',
    desc: 'Spin up entities from Lab Control to experiment with addresses and flows.',
    icon: Drama,
    path: '/lab/control',
    nav: { type: 'pair', left: 'Lab', right: 'Control' },
  },
  {
    kind: 'dual',
    title: 'Move coins in and out of the Lab',
    desc: 'Send from the wallet and watch Lab Transactions to see how Bitcoin-style transfers behave.',
    icon: ArrowLeftRight,
    first: { path: '/wallet/send', left: 'Wallet', right: 'Send' },
    second: { path: '/lab/transactions', left: 'Lab', right: 'Transactions' },
  },
  {
    kind: 'single',
    title: 'Switch to Testnet again',
    desc: 'Connect to Testnet again to continue your journey.',
    icon: Settings,
    path: '/settings',
    nav: { type: 'single', label: 'Settings' },
  },
  {
    kind: 'single',
    title: 'Check your balance',
    desc: 'Check your balance in the wallet dashboard to check on the Testnet transaction.',
    icon: House,
    path: '/wallet',
    nav: { type: 'pair', left: 'Wallet', right: 'Dashboard' },
  },
  {
    kind: 'single',
    title: 'Share Testnet with friends',
    desc: 'Keep using your Testnet balance—send a few coins to someone else learning alongside you.',
    icon: Handshake,
    path: '/wallet/send',
    nav: { type: 'pair', left: 'Wallet', right: 'Send' },
  },
  {
    kind: 'single',
    title: 'Lock it down',
    desc: 'When you are ready, set a strong password and back up your mnemonic in Settings.',
    icon: GlobeLock,
    path: '/settings',
    nav: { type: 'single', label: 'Settings' },
  },
  {
    kind: 'single',
    title: 'Go deeper',
    desc: 'Use the Library to study concepts and get ready for Mainnet - or even Lightning!',
    icon: BookOpen,
    path: '/library',
    nav: { type: 'single', label: 'Library' },
  },
  {
    kind: 'single',
    title: 'Activate features',
    desc: 'Unlock Mainnet, Lightning and more features in Settings.',
    icon: ToggleRight,
    path: '/settings',
    nav: { type: 'single', label: 'Settings' },
  },
];

function renderNavHints(
  step: StepSingle | StepDual,
  appUrl: string,
): ReactNode {
  const hasApp = appUrl.length > 0;

  if (step.kind === 'dual') {
    const firstHref = hasApp ? joinAppUrl(appUrl, step.first.path) : undefined;
    const secondHref = hasApp ? joinAppUrl(appUrl, step.second.path) : undefined;
    const pairClass =
      'flex gap-1 rounded-none border border-transparent p-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-matrix/60';
    return (
      <div className="flex flex-wrap items-center gap-2">
        {hasApp ? (
          <>
            <a href={firstHref} className={cn(pairClass, 'hover:border-matrix/50')}>
              <NavHintPair left={step.first.left} right={step.first.right} />
            </a>
            <a href={secondHref} className={cn(pairClass, 'hover:border-matrix/50')}>
              <NavHintPair left={step.second.left} right={step.second.right} />
            </a>
          </>
        ) : (
          <span className="flex flex-wrap items-center gap-2 cursor-not-allowed opacity-50" aria-disabled>
            <NavHintPair left={step.first.left} right={step.first.right} />
            <NavHintPair left={step.second.left} right={step.second.right} />
          </span>
        )}
      </div>
    );
  }

  if (step.nav.type === 'single') {
    return <NavHintSingle label={step.nav.label} />;
  }
  return <NavHintPair left={step.nav.left} right={step.nav.right} />;
}

function GetStartedCard({
  step,
  appUrl,
}: {
  step: StepSingle | StepDual;
  appUrl: string;
}) {
  const hasApp = appUrl.length > 0;
  const Icon = step.icon;

  const cardInner = (
    <>
      <div className="flex items-center gap-4 mb-3">
        <Icon
          className="text-matrix group-hover:scale-110 transition-transform shrink-0"
          size={24}
        />
        <h3 className="text-lg font-bold uppercase tracking-tight text-matrix">{step.title}</h3>
      </div>
      <div className="mb-3">{renderNavHints(step, appUrl)}</div>
      <p className="text-sm text-matrix/80 leading-relaxed font-mono">{step.desc}</p>
    </>
  );

  if (step.kind === 'dual') {
    return (
      <Card className="bg-matrix/5 border-matrix/40 hover:border-matrix transition-colors rounded-none group">
        <CardContent className="p-6">{cardInner}</CardContent>
      </Card>
    );
  }

  const href = hasApp ? joinAppUrl(appUrl, step.path) : undefined;

  if (hasApp && href) {
    return (
      <a href={href} className="group block rounded-none no-underline text-inherit outline-none focus-visible:ring-2 focus-visible:ring-matrix/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[rgb(0,59,0)]">
        <Card className="bg-matrix/5 border-matrix/40 hover:border-matrix transition-colors rounded-none h-full">
          <CardContent className="p-6">{cardInner}</CardContent>
        </Card>
      </a>
    );
  }

  return (
    <div
      className="group rounded-none opacity-90 cursor-not-allowed"
      aria-disabled
      title="App not published yet"
    >
      <Card className="bg-matrix/5 border-matrix/40 rounded-none h-full">
        <CardContent className="p-6">{cardInner}</CardContent>
      </Card>
    </div>
  );
}

export function GetStartedSection({ appUrl }: GetStartedSectionProps) {
  return (
    <Section id="get-started" title="Get Started" className="text-matrix">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {GET_STARTED_STEPS.map((step, i) => (
          <GetStartedCard key={i} step={step} appUrl={appUrl} />
        ))}
      </div>
    </Section>
  );
}
