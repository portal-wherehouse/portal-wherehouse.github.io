// Installable app shell. Only the full app registers it: the dev server changes files constantly,
// and the hosted preview is a single page inside someone else's frame.

export function setupInstallableShell() {
  if (__BUILD_TARGET__ !== 'app' || !import.meta.env.PROD) return;
  const head = document.head;
  const link = (rel: string, href: string) => {
    const el = document.createElement('link');
    el.rel = rel;
    el.href = href;
    head.appendChild(el);
  };
  link('manifest', `${import.meta.env.BASE_URL}manifest.webmanifest`);
  link('apple-touch-icon', `${import.meta.env.BASE_URL}apple-touch-icon.png`);
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
      /* the app works without it; it just will not open offline */
    });
  });
}
