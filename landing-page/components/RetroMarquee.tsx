import React from 'react';
import { motion } from 'motion/react';

interface RetroMarqueeProps {
  text: string;
  className?: string;
  speed?: number;
}

export const RetroMarquee: React.FC<RetroMarqueeProps> = ({ text, className = "", speed = 20 }) => {
  return (
    <div className={`overflow-hidden whitespace-nowrap bg-matrix-dark border-y border-matrix py-1 ${className}`}>
      <motion.div
        className="inline-block"
        animate={{ x: [0, -1000] }}
        transition={{
          duration: speed,
          repeat: Infinity,
          ease: "linear",
        }}
      >
        <span className="text-matrix font-retro text-xl px-4 uppercase tracking-widest">
          {Array(20).fill(text).join(" • ")}
        </span>
      </motion.div>
    </div>
  );
};
