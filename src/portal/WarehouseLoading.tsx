import { useEffect, useRef } from 'react';
import { BrandMark } from '../ui/icons';

export function WarehouseLoading({ name = 'your warehouse', welcome = false, ready = false, onComplete }: { name?: string; welcome?: boolean; ready?: boolean; onComplete?: () => void }) {
  const started = useRef(Date.now());
  const complete = useRef(onComplete); complete.current = onComplete;
  useEffect(() => {
    if (!ready || !complete.current) return;
    const duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 1200;
    const timer = window.setTimeout(() => complete.current?.(), Math.max(0, duration - (Date.now() - started.current)));
    return () => window.clearTimeout(timer);
  }, [ready]);
  return <div className={`warehouse-loading ${welcome ? 'warehouse-welcome' : ''}`} role="status" aria-live="polite">
    <div className="warehouse-loader-mark" aria-hidden="true"><BrandMark /><span /></div>
    {welcome && <><h1>Welcome to Wherehouse.</h1><p>Your warehouse is activated. Let’s get you settled in.</p></>}
    <p className="warehouse-loading-name">Loading {name}…</p>
    <div className="warehouse-loader-track" aria-hidden="true"><span /></div>
  </div>;
}
