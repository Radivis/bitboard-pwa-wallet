import React, { useState } from 'react';
import { useReducedMotion } from 'motion/react';
import { MatrixBackground } from '@/components/MatrixBackground';
import { RetroMarquee } from '@/components/RetroMarquee';
import {
  AboutSection,
  FeaturesSection,
  FutureSection,
  GetStartedSection,
  HeroSection,
  InterfaceSection,
  SiteFooter,
  StorySection,
} from '@/components/sections';
import { landingPageLink } from './landing-page-links';

export default function App() {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const prefersReducedMotion = useReducedMotion();
  const appUrl = landingPageLink('app');
  const githubUrl = landingPageLink('githubRepository');
  const blogUrl = landingPageLink('blog');
  const websiteUrl = landingPageLink('website');
  return (
    <div className="min-h-screen text-white font-sans selection:bg-matrix selection:text-black relative overflow-x-hidden">
      <MatrixBackground reducedMotion={prefersReducedMotion ?? false} />

      <div className="relative z-10">
        <RetroMarquee
          text="BITBOARD PWA WALLET • FROM ZERO TO CLARITY • BITCOIN • LIGHTNING • EDUCATIONAL • WEB + MOBILE INSTALLABLE • SELF-CUSTODIAL • OPEN SOURCE • BLOCKCHAIN SIMULATOR"
          reducedMotion={prefersReducedMotion ?? false}
        />

        <HeroSection appUrl={appUrl} githubUrl={githubUrl} prefersReducedMotion={prefersReducedMotion} />

        <AboutSection />

        <GetStartedSection appUrl={appUrl} />

        <FeaturesSection />

        <FutureSection />

        <InterfaceSection
          prefersReducedMotion={prefersReducedMotion}
          selectedImage={selectedImage}
          onSelectedImageChange={setSelectedImage}
        />

        <StorySection />

        <SiteFooter githubUrl={githubUrl} websiteUrl={websiteUrl} blogUrl={blogUrl} />
      </div>
    </div>
  );
}
