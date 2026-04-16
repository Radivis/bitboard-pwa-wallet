import React from 'react';
import { motion } from 'motion/react';

type SectionAccent = 'matrix' | 'orange';

const SECTION_ACCENT_CLASSES: Record<
  SectionAccent,
  { text: string; line: string }
> = {
  matrix: { text: 'text-matrix', line: 'bg-matrix/30' },
  orange: { text: 'text-orange-500', line: 'bg-orange-500/30' },
};

const DEFAULT_SECTION_PLATE_CLASS =
  'bg-black/40 backdrop-blur-[2px]';

interface SectionProps {
  title?: string;
  children: React.ReactNode;
  className?: string;
  id?: string;
  accent?: SectionAccent;
  /** Overrides the default dark readability plate behind section content */
  plateClassName?: string;
}

export const Section: React.FC<SectionProps> = ({
  title,
  children,
  className = '',
  id,
  accent = 'matrix',
  plateClassName = DEFAULT_SECTION_PLATE_CLASS,
}) => {
  const { text: accentTextClass, line: accentBgClass } = SECTION_ACCENT_CLASSES[accent];

  return (
    <section id={id} className={`py-16 px-6 max-w-4xl mx-auto relative ${className}`}>
      {/* Subtle background plate for readability */}
      <div className={`absolute inset-0 -z-10 rounded-3xl ${plateClassName}`} />
      
      {title && (
        <motion.h2
          initial={{ opacity: 0, x: -20 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          className="text-3xl md:text-4xl font-bold mb-8 flex items-center gap-4"
        >
          <span className={`${accentTextClass} font-mono`}>#</span>
          <span className="uppercase tracking-tighter">{title}</span>
          <div className={`h-px ${accentBgClass} flex-1`} />
        </motion.h2>
      )}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ delay: 0.2 }}
      >
        {children}
      </motion.div>
    </section>
  );
};
