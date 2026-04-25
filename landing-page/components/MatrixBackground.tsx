import React, { useEffect, useRef } from 'react';

interface MatrixBackgroundProps {
  reducedMotion: boolean;
  /** When true, animation stops and the last frame stays visible (saves CPU/GPU). */
  paused?: boolean;
}

export const MatrixBackground: React.FC<MatrixBackgroundProps> = ({ reducedMotion, paused = false }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  const resumeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, width, height);

    if (reducedMotion) {
      resumeRef.current = null;
      const handleResize = () => {
        width = canvas.width = window.innerWidth;
        height = canvas.height = window.innerHeight;
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, width, height);
      };
      window.addEventListener('resize', handleResize);
      return () => {
        window.removeEventListener('resize', handleResize);
        resumeRef.current = null;
      };
    }

    const hexChars = '0123456789ABCDEF';
    const fontSize = 18;
    const columns = Math.floor(width / fontSize);
    const drops: number[] = [];
    const chars: string[] = [];
    let frameCount = 0;

    for (let i = 0; i < columns; i++) {
      drops[i] = (Math.random() * height) / fontSize;
      chars[i] =
        hexChars[Math.floor(Math.random() * hexChars.length)] +
        hexChars[Math.floor(Math.random() * hexChars.length)];
    }

    const draw = () => {
      frameCount++;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
      ctx.fillRect(0, 0, width, height);

      ctx.fillStyle = '#00FF41';
      ctx.shadowBlur = 0;
      ctx.font = `bold ${fontSize}px monospace`;

      for (let i = 0; i < drops.length; i++) {
        if (frameCount % 2 === 0) {
          const char1 = hexChars[Math.floor(Math.random() * hexChars.length)];
          const char2 = hexChars[Math.floor(Math.random() * hexChars.length)];
          chars[i] = char1 + char2;
        }

        const text = chars[i];
        const x = i * fontSize;
        const y = drops[i] * fontSize;

        ctx.fillText(text, x, y);

        if (y > height && Math.random() > 0.975) {
          drops[i] = 0;
        }

        drops[i] += 0.5;
      }
    };

    let animationId: number | undefined;
    let isLoopActive = false;

    const animate = () => {
      if (pausedRef.current) {
        isLoopActive = false;
        return;
      }
      draw();
      animationId = requestAnimationFrame(animate);
    };

    const resume = () => {
      if (pausedRef.current) return;
      if (!isLoopActive) {
        isLoopActive = true;
        animationId = requestAnimationFrame(animate);
      }
    };

    resumeRef.current = resume;
    if (!pausedRef.current) {
      resume();
    }

    const handleResize = () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
      const newColumns = Math.floor(width / fontSize);
      if (newColumns > drops.length) {
        for (let i = drops.length; i < newColumns; i++) {
          drops[i] = Math.random() * -100;
          chars[i] =
            hexChars[Math.floor(Math.random() * hexChars.length)] +
            hexChars[Math.floor(Math.random() * hexChars.length)];
        }
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      if (animationId !== undefined) {
        cancelAnimationFrame(animationId);
      }
      isLoopActive = false;
      resumeRef.current = null;
      window.removeEventListener('resize', handleResize);
    };
  }, [reducedMotion]);

  useEffect(() => {
    if (reducedMotion || paused) return;
    resumeRef.current?.();
  }, [paused, reducedMotion]);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 -z-50 opacity-100 bg-black pointer-events-none"
    />
  );
};
