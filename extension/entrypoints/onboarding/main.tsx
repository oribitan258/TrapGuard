import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import '../../src/assets/tailwind.css';
import { installPageFonts } from '../../src/fonts';

installPageFonts();

const container = document.getElementById('root');
if (!container) throw new Error('onboarding root element missing');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
