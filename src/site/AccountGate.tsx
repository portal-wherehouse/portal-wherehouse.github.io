import { useEffect, useState, type ReactNode } from "react";
import { initializeApp } from "firebase/app";
import {
  GoogleAuthProvider,
  connectAuthEmulator,
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type Auth,
} from "firebase/auth";
import { BRAND } from "../brand";
import { firebaseConfig, usesEmulators } from "../data/firebaseConfig";
import { GoogleMark } from "../portal/GoogleMark";
import { Icon } from "../ui/icons";
import { requestAccount, type AccountStart } from "./accountReturn";
import { useSite } from "./routing";
import "../features/setup/survey.css";
import "./accountGate.css";

// Loaded only on #start, so the homepage does not carry Firebase Auth. Uses the same default
// Firebase app and Auth instance the warehouse app opens later (same config, so no second app).
function siteAuth(): Auth {
  const auth = getAuth(initializeApp(firebaseConfig()!));
  if (usesEmulators())
    connectAuthEmulator(auth, "http://127.0.0.1:9099", {
      disableWarnings: true,
    });
  return auth;
}

type Account = "checking" | "out" | "unverified" | "in";

/** #start: a verified account comes before the survey. */
export default function AccountGate({ children }: { children: ReactNode }) {
  const { go } = useSite();
  const [auth] = useState(siteAuth);
  const [account, setAccount] = useState<Account>("checking");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(
    () =>
      onAuthStateChanged(auth, (user) => {
        setEmail(user?.email ?? "");
        setAccount(!user ? "out" : user.emailVerified ? "in" : "unverified");
      }),
    [auth],
  );
  if (account === "in") return <>{children}</>;
  const toSignIn = (mode: AccountStart) => {
    requestAccount(mode);
    go("signin");
  };
  const google = async () => {
    setBusy(true);
    setError("");
    try {
      const { user } = await signInWithPopup(auth, new GoogleAuthProvider());
      if (user.emailVerified) setAccount("in");
    } catch (e) {
      const code = (e as { code?: string }).code ?? "";
      if (!code.includes("popup-closed") && !code.includes("cancelled-popup"))
        setError("Google sign-in didn’t finish. Try again.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="survey survey-site account-gate" data-testid="account-gate">
      <div className="survey-bg" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <header className="survey-top">
        <strong className="survey-brand">{BRAND.name}</strong>
        <span className="account-gate-spacer" />
        <button
          type="button"
          className="survey-close"
          aria-label="Back to the website"
          onClick={() => go("home")}
        >
          <Icon name="x" />
        </button>
      </header>
      <main className="survey-stage">
        {account === "checking" ? (
          <p role="status">Loading…</p>
        ) : (
          <section className="survey-card enter-fwd">
            <p className="survey-eyebrow">Find your plan · about 2 minutes</p>
            {account === "out" ? (
              <>
                <h1 className="survey-q">
                  Create an account to begin your survey
                </h1>
                <p className="survey-hint">
                  It takes a minute. Your account is where your plan and your
                  free trial will live.
                </p>
                <p className="survey-note account-gate-promise">
                  <Icon name="mail" /> We only email you verification and
                  sign-in codes. No newsletters, no spam.
                </p>
                <div className="account-gate-actions">
                  <button
                    type="button"
                    className="survey-go"
                    disabled={busy}
                    onClick={() => toSignIn("register")}
                  >
                    Create account <Icon name="arrowRight" />
                  </button>
                  <button
                    type="button"
                    className="survey-ghost"
                    disabled={busy}
                    onClick={() => toSignIn("signin")}
                  >
                    Sign in
                  </button>
                  <button
                    type="button"
                    className="survey-ghost account-gate-google"
                    disabled={busy}
                    onClick={() => void google()}
                  >
                    <GoogleMark />
                    Continue with Google
                  </button>
                </div>
              </>
            ) : (
              <>
                <h1 className="survey-q">
                  Verify your email to begin your survey
                </h1>
                <p className="survey-hint">
                  Enter the 6-digit code we email to <strong>{email}</strong>.
                  Then your survey starts.
                </p>
                <p className="survey-note account-gate-promise">
                  <Icon name="mail" /> We only email you verification and
                  sign-in codes. No newsletters, no spam.
                </p>
                <div className="account-gate-actions">
                  <button
                    type="button"
                    className="survey-go"
                    onClick={() => toSignIn("signin")}
                  >
                    Enter my code <Icon name="arrowRight" />
                  </button>
                  <button
                    type="button"
                    className="survey-ghost"
                    disabled={busy}
                    onClick={() => void signOut(auth)}
                  >
                    Use a different account
                  </button>
                </div>
              </>
            )}
            {error && (
              <p role="alert" className="survey-error">
                {error}
              </p>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
