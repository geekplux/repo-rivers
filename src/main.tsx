import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { embedFromSearch } from './data/urlState.ts';
import { SocialCard } from './ui/SocialCard.tsx';
import './ui/theme/tokens.css';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {embedFromSearch(location.search) === 'social' ? <SocialCard /> : <App />}
  </StrictMode>,
);
