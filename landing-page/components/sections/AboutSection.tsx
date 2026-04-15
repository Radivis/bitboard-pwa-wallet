import { Cpu, FlaskConical, Smartphone, BookOpen } from 'lucide-react';
import { Section } from '@/components/Section';

interface AboutSectionProps {
  aboutBackgroundImageUrl: string;
}

export function AboutSection({ aboutBackgroundImageUrl }: AboutSectionProps) {
  return (
    <Section id="about" title="The Vision">
      <div className="grid md:grid-cols-2 gap-12 items-center">
        <div>
          <p className="text-lg text-gray-300 leading-relaxed mb-6">
            Bitboard is designed to take you <span className="text-matrix italic">from zero to clarity</span>. Start
            instantly in your browser, then seamlessly install it as a native mobile app. Your journey to self-custody
            and Bitcoin mastery starts here!
          </p>
          <div className="space-y-4">
            {[
              { icon: Smartphone, text: 'Instant Web-to-Mobile transition via PWA.' },
              { icon: FlaskConical, text: 'The Lab: A cryptographically correct blockchain sandbox.' },
              { icon: BookOpen, text: 'The Library: In-depth Bitcoin & Lightning learning.' },
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-3 text-sm text-gray-400">
                <item.icon size={18} className="text-matrix" />
                <span>{item.text}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="relative aspect-square bg-matrix/5 border border-matrix/20 p-8 flex items-center justify-center group overflow-hidden">
          <div
            className="absolute inset-0 opacity-30 grayscale group-hover:grayscale-0 transition-all duration-700 bg-cover bg-center"
            style={{ backgroundImage: `url('${aboutBackgroundImageUrl}')` }}
          />
          <div className="relative z-10 text-center">
            <Cpu size={80} className="text-matrix mx-auto mb-4 drop-shadow-[0_0_15px_rgba(0,255,65,0.5)]" />
            <div className="font-retro text-2xl text-matrix uppercase">The Matrix Revealed</div>
          </div>
        </div>
      </div>
    </Section>
  );
}
