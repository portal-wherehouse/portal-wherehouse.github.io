import type { FirebaseOptions } from "firebase/app";

/** The public web config from VITE_FIREBASE_CONFIG, or null when live accounts are not set up. */
export function firebaseConfig(): FirebaseOptions | null {
  const raw = import.meta.env.VITE_FIREBASE_CONFIG;
  if (!raw) return null;
  try {
    const c = JSON.parse(raw);
    if (c.apiKey && c.authDomain && c.projectId && c.appId && c.storageBucket)
      return c;
  } catch {
    /* setup message below */
  }
  return null;
}

/** Local builds that talk to the Firebase emulators instead of a project. */
export function usesEmulators(): boolean {
  return (
    (import.meta.env.DEV || import.meta.env.MODE === "emulator") &&
    import.meta.env.VITE_FIREBASE_EMULATORS === "true"
  );
}

/** The sample warehouse: demo builds and ?demo=1 links. No accounts. */
export function sampleMode(): boolean {
  return (
    import.meta.env.VITE_APP_MODE === "demo" ||
    new URLSearchParams(location.search).get("demo") === "1"
  );
}
