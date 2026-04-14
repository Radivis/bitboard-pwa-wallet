import React from 'react';
import { motion } from 'motion/react';

interface SectionProps {
  title?: string;
  children: React.ReactNode;
  className?: string;
  id?: string;
  accentColor?: string;
}

export const Section: React.FC<SectionProps> = ({ title, children, className = "", id, accentColor = "matrix" }) => {
  const accentTextClass = accentColor === "matrix" ? "text-matrix" : `text-${accentColor}`;
  const accentBgClass = accentColor === "matrix" ? "bg-matrix/30" : `bg-${accentColor}/30`;

  return (
    <section id={id} className={`py-16 px-6 max-w-4xl mx-auto relative ${className}`}>
      {/* Subtle background plate for readability */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] -z-10 rounded-3xl" />
      
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
