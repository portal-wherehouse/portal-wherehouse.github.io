// Security and data: plain answers for customers about ownership, roles, history, photos, storage,
// sign-in, backups and lost phones. Anything not live yet is labeled planned.

import type { ReactNode } from 'react';
import { BRAND } from '../../brand';
import type { Role } from '../../domain/types';
import { Icon, type IconName } from '../../ui/icons';
import { Plate, ROLE_LABEL } from '../../ui/ui';
import { CtaBand, FeatureCards, PageHero, Section, SiteLink } from '../kit';
import { Coming, EmailCopy } from './d-kit';
import './security.css';

export function SecurityPage() {
  return (
    <>
      <div className="site-inner">
        <PageHero
          eyebrow="Security and data"
          title="Your records stay yours"
          lede={`Plain answers about where ${BRAND.name} keeps your records, who can see them, and what happens when something goes wrong. Where something is still planned, this page says so.`}
          art={<StatusBoard />}
        >
          <SiteLink to="security" hash="stored" className="site-btn primary">
            Where data is stored
          </SiteLink>
          <SiteLink to="security" hash="lost-phone" className="site-btn ghost">
            If a phone is lost
          </SiteLink>
        </PageHero>
      </div>

      <Section id="yours" eyebrow="Ownership" title="Your data is yours" lede="The records you create belong to your company. Taking them with you should never take a phone call.">
        <FeatureCards
          columns={3}
          items={[
            {
              icon: 'export',
              title: 'Export any time',
              body: 'Supervisors and owners can download every pallet, the full history, every location and every job as spreadsheet files, whenever they like. No request, no waiting.',
            },
            {
              icon: 'text',
              title: 'Plain, standard files',
              body: 'Exports are ordinary CSV files that open in Excel or Google Sheets, with a small file that records when and how they were made.',
            },
            {
              icon: 'building',
              title: 'Your company is its own space',
              body: 'Each company has its own workspace. Nothing crosses between them, not even whether a pallet or rack code exists.',
            },
          ]}
        />
      </Section>

      <Section id="roles" tone="surface" eyebrow="Access" title="Who can see what" lede="Everyone signs in to your company’s workspace with a role. The role decides what they can change, and every change is checked against it, not just hidden on screen.">
        <RolesTable />
        <p className="sec-note">
          <Icon name="info" />
          <span>Supervisors can add and remove operators and viewers. Only an owner can give someone supervisor or owner access, and a company always keeps at least one owner.</span>
        </p>
      </Section>

      <Section id="history" tone="ink" eyebrow="History" title="Every change is recorded. Nothing is erased." lede="Each pallet carries its own history: what changed, who changed it, and when. Mistakes are fixed by adding a correction, so the original stays in view.">
        <div className="sec-history">
          <HistoryMock />
          <ul className="sec-points">
            <Point icon="history" title="Before and after">
              Every entry records the pallet’s state and rack before and after the change.
            </Point>
            <Point icon="user" title="Who and when">
              The account that made the change and the exact time, shown in your local time.
            </Point>
            <Point icon="edit" title="Corrections, not deletions">
              A supervisor adds a correction with a reason. The mistake stays in the history, and the correction points back to it.
            </Point>
            <Point icon="refresh" title="No double entries">
              If a signal drops mid-save, the retry is recognized as the same request, so a move is never recorded twice.
            </Point>
          </ul>
        </div>
      </Section>

      <Section id="photos" eyebrow="Photos" title="Photos stay private" lede="Photos of damage, labels and deliveries are part of your records, so they get the same protection.">
        <FeatureCards
          columns={3}
          items={[
            { icon: 'lock', title: 'Only your company', body: 'A photo is visible only to people in your company’s workspace. There are no public links to share by accident.' },
            { icon: 'pin', title: 'Location data removed', body: 'Before a photo is saved, the phone re-draws it. That strips hidden details such as GPS position and the camera model.' },
            {
              icon: 'cloud',
              title: (
                <>
                  Private cloud storage <Coming>Planned</Coming>
                </>
              ),
              body: 'At launch, photos move to private Google Cloud storage, with access checked on every view. Today they stay in the browser that took them.',
            },
          ]}
        />
      </Section>

      <Section id="stored" tone="surface" eyebrow="Storage" title="Where your data is stored" lede="Two answers: one for this preview, and one for launch. They are different, so here are both.">
        <div className="sec-compare">
          <article className="sec-col now">
            <header>
              <span className="sec-col-tag now">Today</span>
              <h3>In this preview</h3>
            </header>
            <ul>
              <Row icon="phone">Everything is stored in your own browser, on your own device.</Row>
              <Row icon="wifiOff">Nothing is sent to us or anyone else. The server and sign-in are simulated in the browser.</Row>
              <Row icon="alert">Clearing your browser’s site data removes it. Each browser keeps its own copy.</Row>
              <Row icon="download">Supervisors and owners can download a full backup file from the Data and storage page in the portal.</Row>
            </ul>
          </article>
          <article className="sec-col later">
            <header>
              <span className="sec-col-tag later">Planned</span>
              <h3>At launch</h3>
            </header>
            <ul>
              <Row icon="key">Sign-in with Firebase Authentication: an email link, a password, or a Google account.</Row>
              <Row icon="database">Records stored with Google Cloud through Firebase, shared by your whole crew.</Row>
              <Row icon="shield">Every change checked on the server by the same rules the preview uses today.</Row>
              <Row icon="lock">Google Cloud encrypts stored data by default, and every connection uses HTTPS.</Row>
            </ul>
          </article>
        </div>
      </Section>

      <Section id="backups" eyebrow="Backups" title="Backed up, and restorable">
        <div className="sec-backups">
          <div className="sec-backup-card">
            <span className="sec-col-tag later">Planned</span>
            <h3>Automatic backups on the server</h3>
            <p>The database is backed up on a schedule, and can be rolled back to an earlier point in time if something goes badly wrong. You will not need to do anything.</p>
          </div>
          <div className="sec-backup-card">
            <span className="sec-col-tag now">Today</span>
            <h3>Your own copy, whenever you want it</h3>
            <p>Export your records as spreadsheets at any time. In the preview, you can also download one backup file of everything in your browser, and restore it later.</p>
          </div>
        </div>
      </Section>

      <Section id="lost-phone" tone="surface" eyebrow="Lost or stolen phone" title="If a phone goes missing" lede="Phones get dropped, left in trucks and stolen. Here is what to do, and what happens to the records.">
        <ol className="sec-steps">
          <Step n={1} title="Tell a supervisor or owner">
            They can act right away from the People page in the portal. No call to us is needed.
          </Step>
          <Step n={2} title="Remove that person’s access">
            Removing someone takes effect on their next request: the server refuses every change and every read from that account. Add them back later when they have a new phone.
          </Step>
          <Step n={3} title="Check what changed">
            Every change from that phone is in the history with the time, so anything unexpected is easy to spot and correct.
          </Step>
        </ol>
        <p className="sec-note">
          <Icon name="lock" />
          <span>
            Records the phone already downloaded for offline use stay on it until the app is signed out. Keep work phones locked with a passcode, the same as you would for email.
          </span>
        </p>
      </Section>

      <Section id="honest" eyebrow="Straight answers" title="What we do not claim" narrow>
        <div className="sec-honest">
          <p>
            {BRAND.name} has not been audited or certified by an outside security firm yet. We do not show badges we have not earned. When that changes, this page will say so,
            with the details.
          </p>
          <p>Have a question your IT team needs answered, or a questionnaire to fill in? Ask. You will get a straight answer.</p>
          <div className="sec-contact">
            <SiteLink to="contact" className="site-btn primary">
              <Icon name="mail" /> Ask a security question
            </SiteLink>
            <EmailCopy email={BRAND.supportEmail} tone="boxed" />
          </div>
        </div>
      </Section>

      <CtaBand title="Know where every pallet is, and who moved it." body="See the history, roles and exports for yourself. Book a walkthrough, or open the portal and try the preview now." />
    </>
  );
}

// ------------------------------------------------------------------ pieces

const STATUS: { icon: IconName; what: string; today: string; later: string | null }[] = [
  { icon: 'database', what: 'Where records live', today: 'Your browser', later: 'Google Cloud, via Firebase' },
  { icon: 'key', what: 'Sign-in', today: 'Off for testing', later: 'Firebase Authentication' },
  { icon: 'history', what: 'Change history', today: 'Every change, kept', later: null },
  { icon: 'export', what: 'Export to CSV', today: 'Any time', later: null },
  { icon: 'refresh', what: 'Backups', today: 'Download your own', later: 'Automatic, daily' },
];

function StatusBoard() {
  return (
    <div className="sec-board" role="table" aria-label="Security status: today and planned">
      <div className="sec-board-head" role="row">
        <span role="columnheader">What</span>
        <span role="columnheader">Today</span>
        <span role="columnheader">At launch</span>
      </div>
      {STATUS.map((s) => (
        <div key={s.what} className="sec-board-row" role="row">
          <span className="sec-board-what" role="rowheader">
            <Icon name={s.icon} />
            {s.what}
          </span>
          <span className="sec-board-cell" role="cell">
            <Icon name="checkCircle" className="ok" />
            <span>{s.today}</span>
          </span>
          <span className="sec-board-cell" role="cell">
            {s.later ? (
              <>
                <Icon name="clock" className="later" />
                <span>
                  {s.later} <span className="sec-planned">Planned</span>
                </span>
              </>
            ) : (
              <span className="sec-same">Same</span>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}

const ROLES: { role: Role; sees: string; changes: string }[] = [
  { role: 'OWNER', sees: 'Everything in the company', changes: 'Everything, including who has access and at what role' },
  { role: 'SUPERVISOR', sees: 'Everything in the company', changes: 'Jobs and racks, corrections, clearing holds, exports, operators and viewers' },
  { role: 'OPERATOR', sees: 'Pallets, racks, history and photos', changes: 'Receive, place, move, dispatch, returns, holds and photos' },
  { role: 'VIEWER', sees: 'Pallets, racks, history and photos', changes: 'Nothing. Search and look only' },
];

function RolesTable() {
  return (
    <div className="sec-roles">
      {ROLES.map((r) => (
        <div key={r.role} className="sec-role">
          <div className="sec-role-name">
            <Icon name={r.role === 'VIEWER' ? 'eye' : r.role === 'OPERATOR' ? 'hardhat' : r.role === 'SUPERVISOR' ? 'shield' : 'key'} />
            {ROLE_LABEL[r.role]}
          </div>
          <dl>
            <dt>Can see</dt>
            <dd>{r.sees}</dd>
            <dt>Can change</dt>
            <dd>{r.changes}</dd>
          </dl>
        </div>
      ))}
    </div>
  );
}

function HistoryMock() {
  const rows: { what: string; detail: ReactNode; who: string; when: string; kind?: 'fix' | 'struck' }[] = [
    { what: 'Correction', detail: <>Rack was A-03-01, not A-03-02. Reason: wrong rack scanned.</>, who: 'Supervisor', when: '9:40 AM', kind: 'fix' },
    {
      what: 'Moved',
      detail: (
        <>
          <Plate code="RECEIVING-01" size="sm" /> <Icon name="arrowRight" className="sec-arrow" /> <Plate code="A-03-02" size="sm" />
        </>
      ),
      who: 'Operator',
      when: '7:15 AM',
      kind: 'struck',
    },
    { what: 'Received', detail: <>Job J-214, Lighting fixtures</>, who: 'Operator', when: '7:02 AM' },
  ];
  return (
    <figure className="sec-mock" aria-label="Example pallet history">
      <div className="sec-mock-head">
        <Plate code="P-000042" />
        <span className="sec-mock-sub">History · newest first</span>
      </div>
      <ol className="sec-timeline">
        {rows.map((r) => (
          <li key={r.what} className={r.kind ?? ''}>
            <div className="sec-tl-top">
              <strong>{r.what}</strong>
              <span className="sec-tl-when">{r.when}</span>
            </div>
            <div className="sec-tl-detail">{r.detail}</div>
            <div className="sec-tl-who">
              <Icon name="user" /> {r.who} account
            </div>
          </li>
        ))}
      </ol>
      <figcaption>Example only. The original move stays visible, and the correction points back to it.</figcaption>
    </figure>
  );
}

function Point({ icon, title, children }: { icon: IconName; title: string; children: ReactNode }) {
  return (
    <li>
      <span className="sec-point-icon">
        <Icon name={icon} />
      </span>
      <div>
        <strong>{title}</strong>
        <p>{children}</p>
      </div>
    </li>
  );
}

function Row({ icon, children }: { icon: IconName; children: ReactNode }) {
  return (
    <li>
      <Icon name={icon} />
      <span>{children}</span>
    </li>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <li className="sec-step">
      <span className="sec-step-n" aria-hidden="true">
        {n}
      </span>
      <div>
        <h3>{title}</h3>
        <p>{children}</p>
      </div>
    </li>
  );
}
