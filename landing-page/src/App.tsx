import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Wallet, 
  Shield, 
  Zap, 
  Globe, 
  Cpu, 
  Code, 
  Github, 
  ExternalLink,
  ChevronRight,
  Terminal,
  Sailboat,
  Smartphone,
  X,
Lightbulb,
Key,
Gauge,
BookOpen,
FlaskConical,
HardDrive,
Activity,
} from 'lucide-react';
import { MatrixBackground } from '@/components/MatrixBackground';
import { RetroMarquee } from '@/components/RetroMarquee';
import { Section } from '@/components/Section';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";

export default function App() {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  return (
    <div className="min-h-screen text-white font-sans selection:bg-matrix selection:text-black relative overflow-x-hidden">
      <MatrixBackground />
      
      <div className="relative z-10">
        {/* Top Bar / Early Web Vibe */}
        <RetroMarquee text="BITBOARD PWA WALLET • FROM ZERO TO CLARITY • BITCOIN • LIGHTNING • EDUCATIONAL • WEB + MOBILE INSTALLABLE • SELF-CUSTODIAL • OPEN SOURCE • BLOCKCHAIN SIMULATOR" />

      {/* Hero Section */}
      <header className="relative h-screen flex flex-col items-center justify-center text-center px-6 overflow-hidden">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
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
            BIT<span className="text-matrix">BOARD WALLET</span>
          </h1>
          <p className="text-xl md:text-3xl text-matrix font-retro uppercase tracking-[0.2em] mb-8">
            From Zero to Clarity
          </p>
          <p className="text-xl md:text-2xl text-gray-400 max-w-2xl mx-auto mb-8 font-light">
            The ultimate onboarding gateway to <span className="text-white font-medium">Bitcoin & Lightning</span>. Learn, experiment, and transact with increased sovereignty.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Button size="lg" className="bg-matrix text-black hover:bg-matrix/80 font-bold rounded-none px-8 h-14 text-lg group">
              LAUNCH APP <ChevronRight className="ml-2 group-hover:translate-x-1 transition-transform" />
            </Button>
            <a href="https://github.com/Radivis/bitboard-pwa-wallet" target="_blank" rel="noopener noreferrer">
              <Button size="lg" className="bg-matrix text-black hover:bg-matrix/80 font-bold rounded-none px-8 h-14 text-lg group">
                VIEW GITHUB <Github className="ml-2 group-hover:translate-x-1 transition-transform" />
              </Button>
            </a>
          </div>
        </motion.div>

        {/* Decorative elements */}
        <div className="absolute bottom-10 left-10 hidden md:block text-left font-mono text-[10px] text-matrix/40 leading-tight">
          [STATUS: ENCRYPTED]<br />
          [PROTOCOL: NOSTR WALLET CONNECT]<br />
          [NETWORK: MAINNET]<br />
          [SEED: VERIFIED]
        </div>
        
        <motion.div 
          animate={{ y: [0, 10, 0] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="absolute bottom-10 left-1/2 -translate-x-1/2 text-matrix/50"
        >
          <div className="w-px h-12 bg-gradient-to-b from-matrix to-transparent mx-auto" />
          <span className="text-[10px] uppercase tracking-[0.3em] mt-2 block">Scroll</span>
        </motion.div>
      </header>

      {/* Project Description */}
      <Section id="about" title="The Vision">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <div>
            <p className="text-lg text-gray-300 leading-relaxed mb-6">
              Bitboard is designed to take you <span className="text-matrix italic">from zero to clarity</span>. Start instantly in your browser, then seamlessly install it as a native mobile app. Your journey to self-custody and Bitcoin mastery starts here!
            </p>
            <div className="space-y-4">
              {[
                { icon: Smartphone, text: "Instant Web-to-Mobile transition via PWA." },
                { icon: FlaskConical, text: "The Lab: A cryptographically correct blockchain sandbox." },
                { icon: BookOpen, text: "The Library: In-depth Bitcoin & Lightning learning." }
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-3 text-sm text-gray-400">
                  <item.icon size={18} className="text-matrix" />
                  <span>{item.text}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="relative aspect-square bg-matrix/5 border border-matrix/20 p-8 flex items-center justify-center group overflow-hidden">
            <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&q=80&w=800&h=800')] opacity-30 grayscale group-hover:grayscale-0 transition-all duration-700 bg-cover bg-center" />
            <div className="relative z-10 text-center">
              <Cpu size={80} className="text-matrix mx-auto mb-4 drop-shadow-[0_0_15px_rgba(0,255,65,0.5)]" />
              <div className="font-retro text-2xl text-matrix uppercase">The Matrix Revealed</div>
            </div>
          </div>
        </div>
      </Section>

      {/* Features Showcase */}
      <Section id="features" title="Features">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            {
              title: "The Library",
              desc: "A curated repository of knowledge. Master the fundamentals of cryptography and decentralized finance.",
              icon: BookOpen
            },
            {
              title: "The Lab",
              desc: "A cryptographically correct blockchain sandbox. Experiment with transactions without risking real funds.",
              icon: FlaskConical
            },
            {
              title: "Infomode",
              desc: "Get quick help on parts of the app by simply tapping them, yielding direct explanation in a popup.",
              icon: Lightbulb
            },
            {
              title: "Lightning Connected",
              desc: "Lightning Network integration via NWC for near-instant, low-fee global transactions.",
              icon: Zap
            },
            {
              title: "Web to Mobile",
              desc: "Start on the web, then 'Add to Home Screen' for a full native mobile experience.",
              icon: Smartphone
            },
            {
              title: "Self-Custodial",
              desc: "Your keys, your coins. Your private data or seed phrases only live in your browser / app.",
              icon: Key
            },
            {
              title: "Open Source",
              desc: "Fully transparent code. Auditable by anyone, anywhere, at any time.",
              icon: Code
            },
            {
              title: "State of the Art Security",
              desc: "Your private data is protected by quantum-ready encryption algorithms (AES-256-GCM + Argon2id).",
              icon: Shield
            },
            {
              title: "Seriously fast Tech",
              desc: "Encryption and cryptographic operations are perfomed by dedicated Rust->WASM web workers - keeping the app snappy and secure.",
              icon: Gauge
            },
          ].map((feature, i) => (
            <Card key={i} className="bg-white/5 border-white/10 hover:border-matrix/50 transition-colors rounded-none group">
              <CardContent className="p-6">
                <div className="flex items-center gap-4 mb-4">
                  <feature.icon className="text-matrix group-hover:scale-110 transition-transform shrink-0" size={24} />
                  <h3 className="text-lg font-bold uppercase tracking-tight text-gray-500">{feature.title}</h3>
                </div>
                <p className="text-sm text-gray-400 leading-relaxed">{feature.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </Section>

      {/* The Future Section */}
      <Section id="future" title="The Future" accentColor="orange-500">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            {
              title: "Connecting Hardware Wallets",
              desc: "Even with top security, online wallets are inherently at risk. Secure your coins by moving them to a hardware wallet and using Bitboard Wallet as bridge to the blockchain.",
              icon: HardDrive
            },
            {
              title: "Integrated Lightning",
              desc: "Run your own Lightning node in Bitboard rather than connecting to one via NWC. No more dependency on external Lightning wallets.",
              icon: Activity
            },
            {
              title: "Layer 2 Upgrade",
              desc: "Use the brand new Ark protocol as alternative to Lightning. Avoid the complexities of Lightning and move coins cheaply with ease.",
              icon: Sailboat
            },
          ].map((item, i) => (
            <Card key={i} className="bg-orange-500/5 border-orange-500/10 hover:border-orange-500/50 transition-colors rounded-none group">
              <CardContent className="p-6">
                <div className="flex items-center gap-4 mb-4">
                  <item.icon className="text-orange-500 group-hover:scale-110 transition-transform shrink-0" size={24} />
                  <h3 className="text-lg font-bold uppercase tracking-tight text-orange-200/70">{item.title}</h3>
                </div>
                <p className="text-sm text-orange-100/60 leading-relaxed">{item.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </Section>

      {/* Interface Section */}
      <Section id="screenshots" title="Interface">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((n) => (
            <motion.div 
              key={n}
              whileHover={{ scale: 1.05, rotate: n % 2 === 0 ? 1 : -1 }}
              onClick={() => setSelectedImage(`/screen${n}.png`)}
              className="aspect-[9/16] bg-gray-900 border border-white/10 overflow-hidden relative group cursor-pointer"
            >
              <img 
                src={`/screen${n}.png`} 
                alt={`Screenshot ${n}`}
                className="w-full h-full object-cover group-hover:grayscale-0 transition-all duration-500"
                referrerPolicy="no-referrer"
              />
              <div className="absolute inset-0 bg-matrix/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <Badge className="bg-matrix text-black rounded-none font-retro">VIEW_FULLSCREEN</Badge>
              </div>
            </motion.div>
          ))}
        </div>
      </Section>

      {/* Development Story */}
      <Section id="story" title="The Origin">
        <div className="bg-matrix/5 border border-matrix/20 p-8 md:p-12 relative overflow-hidden">
          <Terminal className="absolute -right-8 -bottom-8 text-matrix/5 w-64 h-64 rotate-12" />
          <div className="relative z-10 max-w-2xl">
            <h3 className="text-2xl font-bold mb-6 flex items-center gap-3">
              <Code className="text-matrix" />
              REVEALING THE MATRIX
            </h3>
            <div className="space-y-4 text-gray-300 leading-relaxed font-mono text-sm">
              <p>&gt; After visiting BTC Prague in 2025 I was convinced by the immense potential of Lightning.</p>
              <p>&gt; A deep dive into the foundations of Bitcoin and Lightning revealed to me that most of the potential of these breakthrough technologies remains untapped.</p>
              <p>&gt; I saw the need for a wallet that can both provide a quick start and a gradual exploration of the ecosystem and its foundational technologies.</p>
              <p>&gt; Bitboard Wallet represents my best shot at demystifying the Bitcoin Matrix to those willing to take that plunge.</p>
              <p>&gt; "From zero to clarity" is not an empty phrase, but an overarching product philosophy.</p>
            </div>
          </div>
        </div>
      </Section>

      {/* Footer */}
      <footer className="border-t border-white/10 py-12 px-6 mt-20">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="text-center md:text-left">
            <div className="text-2xl font-bold mb-2">BIT<span className="text-matrix">BOARD WALLET</span></div>
            <p className="text-gray-500 text-sm">from zero to clarity</p>
          </div>
          
          <div className="flex gap-6">
            <a href="https://github.com/Radivis/bitboard-pwa-wallet" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-matrix transition-colors"><Github size={20} /></a>
            <a href="#" className="text-gray-400 hover:text-matrix transition-colors"><Globe size={20} /></a>
            <a href="#" className="text-gray-400 hover:text-matrix transition-colors"><ExternalLink size={20} /></a>
          </div>
          
          <div className="text-gray-500 text-[10px] uppercase tracking-widest">
            Developed by Michael Hrenka • MIT LICENSE • FOSS
          </div>
        </div>
      </footer>

      {/* Lightbox Dialog */}
      <Dialog open={!!selectedImage} onOpenChange={(open) => !open && setSelectedImage(null)}>
        <DialogContent 
          showCloseButton={false}
          className="max-w-none w-auto h-auto p-0 bg-transparent border-none flex items-center justify-center sm:max-w-none"
        >
          <DialogTitle className="sr-only">Screenshot Preview</DialogTitle>
          <div className="relative group flex items-center justify-center">
            <img 
              src={selectedImage || null} 
              alt="Full Preview" 
              className="max-w-[95vw] max-h-[95vh] object-contain border border-matrix/50 shadow-[0_0_50px_rgba(0,255,65,0.4)]"
            />
            <button 
              onClick={() => setSelectedImage(null)}
              className="absolute top-4 right-4 bg-matrix text-black p-2 rounded-none hover:bg-matrix/80 transition-colors z-50"
            >
              <X size={24} />
            </button>
          </div>
        </DialogContent>
      </Dialog>
      </div>
    </div>
  );
}

