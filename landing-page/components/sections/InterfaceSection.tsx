import { motion } from 'motion/react';
import { X } from 'lucide-react';
import { Section } from '@/components/Section';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

interface InterfaceSectionProps {
  prefersReducedMotion: boolean | null;
  selectedImage: string | null;
  onSelectedImageChange: (path: string | null) => void;
}

export function InterfaceSection({
  prefersReducedMotion,
  selectedImage,
  onSelectedImageChange,
}: InterfaceSectionProps) {
  return (
    <>
      <Section id="screenshots" title="Interface">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((n) => (
            <motion.button
              key={n}
              type="button"
              whileHover={
                prefersReducedMotion ? undefined : { scale: 1.05, rotate: n % 2 === 0 ? 1 : -1 }
              }
              onClick={() => onSelectedImageChange(`/screen${n}.png`)}
              className="aspect-[9/16] bg-gray-900 border border-white/10 overflow-hidden relative group cursor-pointer text-left p-0 rounded-none"
              aria-label={`Open screenshot ${n} full screen`}
            >
              <img
                src={`/screen${n}.png`}
                alt={`Screenshot ${n}`}
                className="w-full h-full object-cover group-hover:grayscale-0 transition-all duration-500"
                referrerPolicy="no-referrer"
              />
              <div className="absolute inset-0 bg-matrix/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                <Badge className="bg-matrix text-black rounded-none font-retro">VIEW_FULLSCREEN</Badge>
              </div>
            </motion.button>
          ))}
        </div>
      </Section>

      <Dialog open={!!selectedImage} onOpenChange={(open) => !open && onSelectedImageChange(null)}>
        <DialogContent
          showCloseButton={false}
          className="max-w-none w-auto h-auto p-0 bg-transparent border-none flex items-center justify-center sm:max-w-none"
        >
          <DialogTitle className="sr-only">Screenshot Preview</DialogTitle>
          <div className="relative group flex items-center justify-center">
            <img
              src={selectedImage || undefined}
              alt="Full Preview"
              className="max-w-[95vw] max-h-[95vh] object-contain border border-matrix/50 shadow-[0_0_50px_rgba(0,255,65,0.4)]"
            />
            <button
              type="button"
              onClick={() => onSelectedImageChange(null)}
              className="absolute top-4 right-4 bg-matrix text-black p-2 rounded-none hover:bg-matrix/80 transition-colors z-50"
              aria-label="Close screenshot preview"
            >
              <X size={24} />
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
