// Integrity Lab: runs the blueprint's acceptance and failure tests (pages 29-33) live in the browser,
// each against its own throwaway database. The same scenarios run in the automated test suite.

import { useState } from 'react';
import { runScenario, type ScenarioResult } from '../../lab/harness';
import { GROUPS, SCENARIOS } from '../../lab/scenarios';
import { Icon } from '../../ui/icons';
import { Explain, PageHead, Spinner } from '../../ui/ui';

const tick = () => new Promise((r) => setTimeout(r, 0));

export function Lab() {
  const [results, setResults] = useState<Record<string, ScenarioResult>>({});
  const [running, setRunning] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [group, setGroup] = useState<string>('All');

  const list = SCENARIOS.filter((s) => group === 'All' || s.group === group);
  const done = list.filter((s) => results[s.id]);
  const passed = done.filter((s) => results[s.id].pass).length;
  const failed = done.length - passed;

  const run = async (ids: string[]) => {
    for (const id of ids) {
      const s = SCENARIOS.find((x) => x.id === id)!;
      setRunning(id);
      await tick();
      const r = await runScenario(s);
      setResults((cur) => ({ ...cur, [id]: r }));
      if (!r.pass) setOpen(id);
    }
    setRunning(null);
  };

  return (
    <div className="stack">
      <PageHead
        title="Integrity lab"
        sub={`${SCENARIOS.length} tests from the blueprint's acceptance and failure lists. Each runs on its own fresh copy of the demo warehouse, so your data is never touched.`}
        actions={
          <button className="btn primary" disabled={!!running} onClick={() => void run(list.map((s) => s.id))}>
            {running ? <Spinner /> : <Icon name="play" />} Run {group === 'All' ? 'all' : group} ({list.length})
          </button>
        }
      />
      <Explain title="Why this page exists" refs="pages 29-33">
        <p>The blueprint says a warehouse app is only trustworthy if it survives the bad days: lost responses, two phones moving the same pallet, a removed employee, a half-finished import. Each row here acts out one of those situations against the real command engine and shows its evidence, line by line.</p>
        <p>These exact scenarios also run as the automated test suite, so what you see here is what the build checks.</p>
      </Explain>

      <div className="row" data-tour="lab-progress">
        <div className="progress grow" style={{ minWidth: 200 }} aria-label={`${done.length} of ${list.length} run`}>
          <div style={{ width: `${(done.length / Math.max(1, list.length)) * 100}%`, background: failed ? 'var(--bad)' : 'var(--ok)' }} />
        </div>
        <span className="num" style={{ fontWeight: 700 }}>
          <span className="pass">{passed} passed</span>
          {failed > 0 && <span className="fail"> · {failed} failed</span>}
          <span className="muted"> · {list.length - done.length} not run</span>
        </span>
      </div>

      <div className="filter-row">
        {['All', ...GROUPS].map((g) => (
          <button key={g} className="pill-toggle" aria-pressed={group === g} onClick={() => setGroup(g)}>
            {g}
          </button>
        ))}
      </div>

      <div className="panel flush" style={{ overflow: 'hidden' }}>
        {list.map((s) => {
          const r = results[s.id];
          return (
            <div key={s.id}>
              <button className="lab-row" onClick={() => setOpen(open === s.id ? null : s.id)} aria-expanded={open === s.id}>
                <span className="lab-id">{s.id}</span>
                <span>
                  <strong>{s.title}</strong>
                  <span className="muted" style={{ display: 'block', fontSize: 13.5 }}>
                    {s.proves} <span className="faint">· page {s.page}</span>
                  </span>
                </span>
                <span className="row nowrap" style={{ gap: 6 }}>
                  {running === s.id ? (
                    <Spinner />
                  ) : r ? (
                    <span className={r.pass ? 'pass' : 'fail'}>
                      <Icon name={r.pass ? 'checkCircle' : 'alertCircle'} width={16} height={16} style={{ verticalAlign: '-3px' }} /> {r.pass ? 'Pass' : 'Fail'}
                      <span className="faint num" style={{ fontWeight: 400, fontSize: 12 }}>
                        {' '}
                        {r.ms} ms
                      </span>
                    </span>
                  ) : (
                    <span
                      className="btn small"
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!running) void run([s.id]);
                      }}
                    >
                      <Icon name="play" /> Run
                    </span>
                  )}
                </span>
              </button>
              {open === s.id && (
                <div className="lab-evidence">
                  {!r && <span className="muted">Not run yet. Press Run to see the evidence.</span>}
                  {r?.lines.map((l, i) => (
                    <div key={i} className="ev">
                      <span className={l.ok === false ? 'fail' : l.ok ? 'pass' : 'faint'}>{l.ok === false ? '✗' : l.ok ? '✓' : '·'}</span>
                      <span>
                        {l.label}
                        {l.detail && <span className="muted"> · {l.detail}</span>}
                      </span>
                    </div>
                  ))}
                  {r?.error && (
                    <div className="ev">
                      <span className="fail">✗</span>
                      <span className="fail">{r.error}</span>
                    </div>
                  )}
                  {r && (
                    <button className="btn small" style={{ alignSelf: 'flex-start', marginTop: 6 }} disabled={!!running} onClick={() => void run([s.id])}>
                      <Icon name="refresh" /> Run again
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
