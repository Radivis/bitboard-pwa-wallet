import React, { useEffect, useRef } from 'react';

export const MatrixBackground: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    // Initialize with solid black
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, width, height);

    const hexChars = '0123456789ABCDEF';
    const fontSize = 24;
    const columns = Math.floor(width / fontSize);
    const drops: number[] = [];
    const chars: string[] = [];
    let frameCount = 0;

    for (let i = 0; i < columns; i++) {
      // Start some drops immediately, others delayed
      drops[i] = Math.random() * height / fontSize;
      chars[i] = hexChars[Math.floor(Math.random() * hexChars.length)] + hexChars[Math.floor(Math.random() * hexChars.length)];
    }

    const draw = () => {
      frameCount++;
      // Use a higher opacity for the trail to ensure the background stays deep black
      ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
      ctx.fillRect(0, 0, width, height);

      ctx.fillStyle = '#00FF41'; // Matrix neon green
      ctx.shadowBlur = 0; // Remove glow entirely to prevent green tinting the background
      ctx.font = `bold ${fontSize}px monospace`;

      for (let i = 0; i < drops.length; i++) {
        // Update character only every 2 frames (50% slower)
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

    let animationId: number;
    const animate = () => {
      draw();
      animationId = requestAnimationFrame(animate);
    };

    animate();

    const handleResize = () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
      const newColumns = Math.floor(width / fontSize);
      if (newColumns > drops.length) {
        for (let i = drops.length; i < newColumns; i++) {
          drops[i] = Math.random() * -100;
          chars[i] = hexChars[Math.floor(Math.random() * hexChars.length)] + hexChars[Math.floor(Math.random() * hexChars.length)];
        }
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 -z-50 opacity-100 bg-black pointer-events-none"
    />
  );
};
