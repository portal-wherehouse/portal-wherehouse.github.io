// About and credits.

import { useState } from 'react';
import { useApp } from '../../app/state';
import { copyText } from '../../device/output';
import { SCENARIOS } from '../../lab/scenarios';
import { BrandMark, Icon } from '../../ui/icons';
import { PageHead } from '../../ui/ui';

export const CREATOR = {
  name: 'John Henry Mims',
  email: 'johnhenry.mims@gmail.com',
  linkedin: 'https://www.linkedin.com/in/john-henry-mims-3161a9237/',
};

export function About() {
  const { toast, go } = useApp();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    const ok = await copyText(CREATOR.email);
    setCopied(ok);
    toast(ok ? 'Email address copied' : 'Select the address and copy it', ok ? 'ok' : 'info');
  };
  return (
    <div className="stack">
      <PageHead title="About" />
      <div className="credit-card">
        <div className="eyebrow">Created by</div>
        <div className="c-name">{CREATOR.name}</div>
        <p style={{ margin: 0, fontSize: 17, maxWidth: '60ch' }}>Pallet Locator was conceived and specified by {CREATOR.name}. It answers one question for a construction material warehouse: where is this pallet right now, and how do we know?</p>
        <div className="credit-links">
          <a className="btn primary big" href={CREATOR.linkedin} target="_blank" rel="noopener noreferrer">
            <Icon name="linkedin" /> LinkedIn
          </a>
          <a className="btn big" href={`mailto:${CREATOR.email}?subject=${encodeURIComponent('Pallet Locator')}`}>
            <Icon name="mail" /> Email
          </a>
          <button className="btn big" onClick={() => void copy()}>
            <Icon name={copied ? 'check' : 'copy'} /> {copied ? 'Copied' : 'Copy email'}
          </button>
        </div>
        <div className="mono" style={{ userSelect: 'all', fontSize: 15 }}>
          {CREATOR.email}
        </div>
      </div>

      <div className="grid-2">
        <div className="panel stack">
          <div className="row nowrap" style={{ gap: 12 }}>
            <BrandMark width={44} height={44} style={{ flex: 'none' }} />
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 26, textTransform: 'uppercase' }}>Pallet Locator</div>
              <div className="muted">Built from the Pallet Locator Complete Build Blueprint, Draft 0.1</div>
            </div>
          </div>
          <p style={{ margin: 0 }}>
            Every rule in this app traces to a page of that blueprint: the command model, the pallet lifecycle, the two-scan move, append-only history, offline replay and the acceptance tests. Look for “Blueprint: page …” under each explanation.
          </p>
          <div className="row">
            <button className="btn" onClick={() => go('guide')}>
              <Icon name="guide" /> Read the guide
            </button>
            <button className="btn" onClick={() => go('lab')}>
              <Icon name="lab" /> Run the {SCENARIOS.length} tests
            </button>
          </div>
        </div>
        <div className="panel stack">
          <div className="panel-title">Made with</div>
          <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 4 }}>
            <li>React and TypeScript, built with Vite</li>
            <li>zod for validating every command at the boundary</li>
            <li>qrcode for labels, jsQR and the browser barcode reader for scanning</li>
            <li>IndexedDB for on-device storage and the offline queue</li>
            <li>Vitest and Playwright for automated tests</li>
            <li>Barlow Condensed, Public Sans and IBM Plex Mono</li>
          </ul>
          <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>
            Demo companies, people and email addresses are fictional.
          </p>
        </div>
      </div>
    </div>
  );
}
