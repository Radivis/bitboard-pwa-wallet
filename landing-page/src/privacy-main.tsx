import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { PrivacyLandingPage } from '@/src/pages/PrivacyLandingPage';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PrivacyLandingPage />
  </StrictMode>,
);
