import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { AppProvider } from './app/state';
import { ScanRouterProvider } from './device/scanRouter';
import { FirebaseBackend } from './data/firebase';
import { Backend } from './data/backend';
import { BRAND } from './brand';
import { setupInstallableShell } from './device/pwa';
import './app/styles.css';

setupInstallableShell();

const root = createRoot(document.getElementById('root')!);

(new URLSearchParams(location.search).get('demo') === '1' || import.meta.env.VITE_APP_MODE === 'demo' ? Backend.open() : FirebaseBackend.connect())
  .then((backend) => {
    root.render(
      <StrictMode>
        <AppProvider backend={backend}>
          <ScanRouterProvider>
            <App />
          </ScanRouterProvider>
        </AppProvider>
      </StrictMode>,
    );
  })
  .catch((err: unknown) => {
    const el = document.getElementById('root')!;
    el.textContent = `${BRAND.name} could not start: ${err instanceof Error ? err.message : String(err)}`;
  });
