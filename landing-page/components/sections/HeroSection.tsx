import { motion } from 'motion/react';
import { ChevronRight, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** Path to the PWA install instructions page (second Vite HTML entry). */
export const PWA_INSTALL_PAGE_PATH = '/install.html';

interface HeroSectionProps {
  appUrl: string;
  prefersReducedMotion: boolean | null;
}

export function HeroSection({ appUrl, prefersReducedMotion }: HeroSectionProps) {
  return (
    <header className="relative h-screen flex flex-col items-center justify-center text-center px-6 overflow-hidden">
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
        className="z-10 flex flex-col items-center"
      >
        <motion.div
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.3, duration: 0.6 }}
          className="mb-8 relative"
        >
          <img
            src="/logo.jpg"
            alt="BitBoard Logo"
            className="w-48 h-48 md:w-[512px] md:h-[512px] object-contain relative z-10"
            referrerPolicy="no-referrer"
          />
        </motion.div>
        <div className="inline-block mb-4 px-3 py-1 border border-matrix text-matrix font-retro text-sm uppercase tracking-widest animate-pulse">
          System Initialized: v0.0.1-demo
        </div>
        <h1 className="text-6xl md:text-9xl font-bold tracking-tighter mb-4 relative">
        <span className="text-bitcoin">BIT</span><span className="text-matrix">BOARD WALLET</span>
        </h1>
        <p className="text-xl md:text-3xl text-matrix font-retro uppercase tracking-[0.2em] mb-8">
          From Zero to Clarity
        </p>
        <p className="text-xl md:text-2xl text-gray-400 max-w-2xl mx-auto mb-8 font-light">
          The ultimate onboarding gateway to{' '}
          <span className="text-white font-medium">Bitcoin & Lightning</span>. Learn, experiment, and transact with
          increased sovereignty.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
          {appUrl ? (
            <a href={appUrl} rel="noopener noreferrer">
              <Button
                size="lg"
                className="bg-matrix text-black hover:bg-matrix/80 font-bold rounded-none px-8 h-14 text-lg group"
              >
                OPEN APP{' '}
                <ChevronRight className="ml-2 inline group-hover:translate-x-1 transition-transform" size={22} />
              </Button>
            </a>
          ) : (
            <Button
              size="lg"
              disabled
              title="App not published yet"
              className="bg-matrix/50 text-black/80 font-bold rounded-none px-8 h-14 text-lg cursor-not-allowed"
            >
              OPEN APP <ChevronRight className="ml-2 inline opacity-50" size={22} />
            </Button>
          )}
          <a href={PWA_INSTALL_PAGE_PATH}>
            <Button
              size="lg"
              className="bg-matrix text-black hover:bg-matrix/80 font-bold rounded-none px-8 h-14 text-lg group border border-matrix/80"
            >
              INSTALL APP{' '}
              <Smartphone className="ml-2 inline group-hover:scale-110 transition-transform" size={22} />
            </Button>
          </a>
        </div>
      </motion.div>

      <div className="absolute bottom-10 left-10 hidden md:block text-left font-mono text-[10px] text-matrix/40 leading-tight">
        [STATUS: ENCRYPTED]
        <br />
        [PROTOCOL: NOSTR WALLET CONNECT]
        <br />
        [NETWORK: MAINNET]
        <br />
        [SEED: VERIFIED]
      </div>

      <motion.div
        animate={prefersReducedMotion ? false : { y: [0, 10, 0] }}
        transition={{ duration: 2, repeat: prefersReducedMotion ? 0 : Infinity }}
        className="absolute bottom-10 left-1/2 -translate-x-1/2 text-matrix/50"
      >
        <div className="w-px h-12 bg-gradient-to-b from-matrix to-transparent mx-auto" />
        <span className="text-[10px] uppercase tracking-[0.3em] mt-2 block">Scroll</span>
      </motion.div>
    </header>
  );
}
