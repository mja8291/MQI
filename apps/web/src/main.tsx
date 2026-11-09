import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { installGlobalErrorHandlers } from './lib/observability';
import { captureInstallPrompt } from './lib/install';
import { installStaleCodeRecovery } from './lib/boot';
import './styles.css';

installGlobalErrorHandlers();
// W61: a page whose code a newer version replaced reloads once instead of failing.
installStaleCodeRecovery();
captureInstallPrompt();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
