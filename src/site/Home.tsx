import { useEffect, useState } from 'react';
import { qrSvg } from '../device/output';
import { Plate, StateBadge } from '../ui/ui';
import { Icon, type IconName } from '../ui/icons';
import { encodeCode128 } from '../device/code128';
import { FeatureCards, Section, SiteLink, PortalCTA } from './kit';
import { PRICING } from './prices';
import './home.css';
import './pilot.css';
export function Home() { return <>
<div className="home-hero-wrap"><div className="site-inner home-hero"><div className="home-hero-text"><p className="site-eyebrow">Warehouse organization, kept simple</p><h1 className="home-hello"><span className="home-hello-sub">Know where</span><span className="home-hello-sub">the job is<span className="home-dot">.</span></span></h1><p className="site-lede home-pitch">Label the pallet. Scan the rack. Find your material without walking every aisle.</p><div className="site-hero-actions"><SiteLink to="contact" className="site-btn primary">Set up your warehouse</SiteLink><SiteLink to="product" className="site-btn ghost">How it works →</SiteLink></div><p className="home-price">${PRICING.monthly}/warehouse/month. Remote setup and support included.</p><PortalCTA variant="inline" /></div><HeroArt /></div></div>
<Section tone="surface"><FeatureCards items={[
{icon:'receive',title:'Receive',body:'Choose the job and print the pallet label.'},
{icon:'move',title:'Move',body:'Scan the pallet and the rack where you put it.'},
{icon:'find',title:'Find',body:'Search the job. See the last recorded location.'}
]} /><div className="site-hero-actions"><SiteLink to="hardware">Printing & scanning →</SiteLink><SiteLink to="simple">What we leave out →</SiteLink><SiteLink to="showcase">Process walkthrough →</SiteLink></div></Section>
</>; }
/** A printed pallet label next to a phone showing where that pallet was last confirmed. */
function HeroArt() {
  const [qr, setQr] = useState('');
  useEffect(() => {
    let live = true;
    void qrSvg('PL1:P:WH-DEMO-000042').then((s) => live && setQr(s));
    return () => {
      live = false;
    };
  }, []);

  return (
    <div className="home-art" role="img" aria-label="A printed pallet label for P-000042 with a QR code and a barcode, beside a phone showing the Find screen: P-000042, stored, last confirmed at rack A-03-02.">
      <div className="home-stage" aria-hidden="true">
        <div className="home-bay">
          <span className="home-bay-up left" />
          <span className="home-bay-up right" />
          <span className="home-bay-load">
            <i />
            <i />
            <i />
          </span>
          <span className="home-bay-beam" />
          <span className="home-bay-tag">
            <b>A-03-02</b>
            <small>Rack</small>
          </span>
        </div>

        <div className="home-label">
          <div className="home-label-stripe" />
          <div className="home-label-code">P-000042</div>
          <div className="home-label-job">Job J-214</div>
          <div className="home-label-desc">Lighting fixtures</div>
          <div className="home-label-row">
            <div className="home-label-qr" dangerouslySetInnerHTML={{ __html: qr }} />
            <div className="home-label-meta">
              School renovation
              <br />
              Maple Street school
            </div>
          </div>
          <Barcode text="P-000042" />
          <div className="home-label-foot">If both codes are damaged, type P-000042</div>
        </div>

        <div className="home-phone">
          <div className="home-phone-screen">
            <div className="home-phone-status">
              <span>9:41</span>
              <span className="home-phone-island" />
              <span className="home-phone-bars">
                <i />
                <i />
                <i />
              </span>
            </div>
            <div className="home-phone-title">Find</div>
            <div className="home-phone-search">
              <Icon name="find" />
              <span className="grow">P-000042</span>
              <span className="home-phone-scanbtn">
                <Icon name="barcode" />
              </span>
            </div>
            <div className="home-phone-hit">
              <div className="home-phone-hit-top">
                <span className="home-phone-code">P-000042</span>
                <StateBadge state="STORED" />
              </div>
              <div className="home-phone-desc">Lighting fixtures</div>
              <div className="home-phone-where">
                <Plate code="A-03-02" size="sm" />
                <span>
                  <b>Last confirmed at A-03-02</b>
                  <br />2 min ago
                </span>
              </div>
              <div className="home-phone-job">
                <span className="home-phone-jcode">J-214</span> School renovation
              </div>
            </div>
            <div className="home-phone-history">
              <div className="home-phone-hist-h">History</div>
              <div className="home-phone-ev">
                <i className="on" />
                Moved B-01-01 to A-03-02
              </div>
              <div className="home-phone-ev">
                <i />
                Placed at B-01-01
              </div>
              <div className="home-phone-ev">
                <i />
                Received for J-214
              </div>
            </div>
            <div className="home-phone-tabs">
              {(['receive', 'move', 'find', 'more'] as IconName[]).map((n) => (
                <span key={n} className={n === 'find' ? 'on' : undefined}>
                  <Icon name={n} />
                  {n[0].toUpperCase() + n.slice(1)}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="home-scan-chip">
          <span className="home-scan-dot" />
          <Icon name="scanner" />
          Scanned P-000042
        </div>
      </div>
    </div>
  );
}

/** The pallet's Code 128 barcode, drawn by the same encoder as the printed labels. */
function Barcode({ text }: { text: string }) {
  const widths = encodeCode128(text).widths;
  const bars: { x: number; w: number }[] = [];
  let x = 0;
  widths.forEach((w, i) => {
    if (i % 2 === 0) bars.push({ x, w });
    x += w;
  });
  return (
    <div className="home-barcode">
      <svg viewBox={`0 0 ${x} 10`} preserveAspectRatio="none">
        {bars.map((b) => (
          <rect key={b.x} x={b.x} width={b.w} height={10} fill="currentColor" />
        ))}
      </svg>
      <span>{text}</span>
    </div>
  );
}
