import React from 'react';
import { motion } from 'motion/react';

interface RetroMarqueeProps {
  text: string;
  className?: string;
  /** Duration in seconds for one full scroll cycle */
  durationSeconds?: number;
  reducedMotion: boolean;
}

export const RetroMarquee: React.FC<RetroMarqueeProps> = ({
  text,
  className = '',
  durationSeconds = 20,
  reducedMotion,
}) => {
  if (reducedMotion) {
    return (
      <div
        className={`overflow-hidden whitespace-nowrap bg-matrix-dark border-y border-matrix py-1 text-center ${className}`}
      >
        <span className="text-matrix font-retro text-xl px-4 uppercase tracking-widest">{text}</span>
      </div>
    );
  }

  return (
    <div className={`overflow-hidden whitespace-nowrap bg-matrix-dark border-y border-matrix py-1 ${className}`}>
      <motion.div
        className="inline-block"
        animate={{ x: [0, -1000] }}
        transition={{
          duration: durationSeconds,
          repeat: Infinity,
          ease: 'linear',
        }}
      >
        <span className="text-matrix font-retro text-xl px-4 uppercase tracking-widest">
          {Array(20)
            .fill(text)
            .join(' • ')}
        </span>
      </motion.div>
    </div>
  );
};
