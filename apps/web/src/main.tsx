import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { installGlobalErrorHandlers } from './lib/observability';
import { captureInstallPrompt } from './lib/install';
import './styles.css';

installGlobalErrorHandlers();
captureInstallPrompt();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
