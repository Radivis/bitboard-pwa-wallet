import {
  BookOpen,
  FlaskConical,
  Lightbulb,
  Zap,
  Smartphone,
  Key,
  Code,
  Shield,
  Gauge,
} from 'lucide-react';
import { Section } from '@/components/Section';
import { Card, CardContent } from '@/components/ui/card';

export function FeaturesSection() {
  return (
    <Section id="features" title="Features">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
          {
            title: 'The Library',
            desc: 'A curated repository of knowledge. Master the fundamentals of cryptography and decentralized finance.',
            icon: BookOpen,
          },
          {
            title: 'The Lab',
            desc: 'A cryptographically correct blockchain sandbox. Experiment with transactions without risking real funds.',
            icon: FlaskConical,
          },
          {
            title: 'Infomode',
            desc: 'Get quick help on parts of the app by simply tapping them, yielding direct explanation in a popup.',
            icon: Lightbulb,
          },
          {
            title: 'Lightning Connected',
            desc: 'Lightning Network integration via NWC for near-instant, low-fee global transactions.',
            icon: Zap,
          },
          {
            title: 'Web to Mobile',
            desc: "Start on the web, then 'Add to Home Screen' for a full native mobile experience.",
            icon: Smartphone,
          },
          {
            title: 'Self-Custodial',
            desc: 'Your keys, your coins. Your private data or seed phrases only live in your browser / app.',
            icon: Key,
          },
          {
            title: 'Open Source',
            desc: 'Fully transparent code. Auditable by anyone, anywhere, at any time.',
            icon: Code,
          },
          {
            title: 'State of the Art Security',
            desc: 'Your private data is protected by quantum-ready encryption algorithms (AES-256-GCM + Argon2id).',
            icon: Shield,
          },
          {
            title: 'Seriously fast Tech',
            desc: 'Encryption and cryptographic operations are performed by dedicated Rust->WASM web workers - keeping the app snappy and secure.',
            icon: Gauge,
          },
        ].map((feature, i) => (
          <Card
            key={i}
            className="bg-white/5 border-white/10 hover:border-matrix/50 transition-colors rounded-none group"
          >
            <CardContent className="p-6">
              <div className="flex items-center gap-4 mb-4">
                <feature.icon
                  className="text-matrix group-hover:scale-110 transition-transform shrink-0"
                  size={24}
                />
                <h3 className="text-lg font-bold uppercase tracking-tight text-gray-500">{feature.title}</h3>
              </div>
              <p className="text-sm text-gray-400 leading-relaxed">{feature.desc}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </Section>
  );
}
