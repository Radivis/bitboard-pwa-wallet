import { HardDrive, Activity, Sailboat, Smartphone, Languages, ShieldCheck } from 'lucide-react';
import { Section } from '@/components/Section';
import { Card, CardContent } from '@/components/ui/card';

export function FutureSection() {
  return (
    <Section id="future" title="The Future" accent="orange">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
          {
            title: 'Connecting Hardware Wallets',
            desc: 'Even with top security, online wallets are inherently at risk. Secure your coins by moving them to a hardware wallet and using Bitboard Wallet as bridge to the blockchain.',
            icon: HardDrive,
          },
          {
            title: 'Integrated Lightning',
            desc: 'Run your own Lightning node in Bitboard rather than connecting to one via NWC. No more dependency on external Lightning wallets.',
            icon: Activity,
          },
          {
            title: 'Layer 2 Upgrade',
            desc: 'Use the brand new Ark protocol as alternative to Lightning. Avoid the complexities of Lightning and move coins cheaply with ease.',
            icon: Sailboat,
          },
          {
            title: 'In Mobile App Stores',
            desc: "Bitboard Wallet as mobile app you can get from a store",
            icon: Smartphone,
          },
          {
            title: 'Multilingual',
            desc: "Browse the Libary in multiple languages and use the app in your language",
            icon: Languages,
          },
          {
            title: 'Audited Security',
            desc: "Proper third party security audits",
            icon: ShieldCheck,
          }
        ].map((item, i) => (
          <Card
            key={i}
            className="bg-orange-500/5 border-orange-500/10 hover:border-orange-500/50 transition-colors rounded-none group"
          >
            <CardContent className="p-6">
              <div className="flex items-center gap-4 mb-4">
                <item.icon
                  className="text-orange-500 group-hover:scale-110 transition-transform shrink-0"
                  size={24}
                />
                <h3 className="text-lg font-bold uppercase tracking-tight text-orange-200/70">{item.title}</h3>
              </div>
              <p className="text-sm text-orange-100/60 leading-relaxed">{item.desc}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </Section>
  );
}
