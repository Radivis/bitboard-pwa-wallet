import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { PwaInstallPage } from '@/src/pages/PwaInstallPage';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PwaInstallPage />
  </StrictMode>,
);
