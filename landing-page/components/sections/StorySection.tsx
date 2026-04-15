import { Code, Terminal } from 'lucide-react';
import { Section } from '@/components/Section';

export function StorySection() {
  return (
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
            <p>
              &gt; A deep dive into the foundations of Bitcoin and Lightning revealed to me that most of the potential of
              these breakthrough technologies remains untapped.
            </p>
            <p>
              &gt; I saw the need for a wallet that can both provide a quick start and a gradual exploration of the
              ecosystem and its foundational technologies.
            </p>
            <p>
              &gt; Bitboard Wallet represents my best shot at demystifying the Bitcoin Matrix to those willing to take
              that plunge.
            </p>
            <p>
              &gt; &quot;From zero to clarity&quot; is not an empty phrase, but an overarching product philosophy.
            </p>
          </div>
        </div>
      </div>
    </Section>
  );
}
