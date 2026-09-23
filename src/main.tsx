import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { AppProvider } from './app/state';
import { Backend } from './data/backend';
import { setupInstallableShell } from './device/pwa';
import './app/styles.css';

setupInstallableShell();

const root = createRoot(document.getElementById('root')!);

Backend.open()
  .then((backend) => {
    root.render(
      <StrictMode>
        <AppProvider backend={backend}>
          <App />
        </AppProvider>
      </StrictMode>,
    );
  })
  .catch((err: unknown) => {
    const el = document.getElementById('root')!;
    el.textContent = `Pallet Locator could not start: ${err instanceof Error ? err.message : String(err)}`;
  });
