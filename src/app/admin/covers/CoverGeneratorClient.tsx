'use client';

import { useEffect, useState } from 'react';
import { Zap } from 'lucide-react';
import { AdminCard, AdminButton, adminInputClass } from '@/components/admin/ui';
import { useToast } from '@/components/providers/ToastProvider';
import { cn } from '@/lib/utils';

/**
 * CoverGeneratorClient — Admin-UI für den Cover-Generator.
 *
 * Zeigt wie viele Tracks kein Cover haben, erlaubt Batch-Run + Force-Regenerate
 * aller Tracks (auch solche mit existierendem Cover).
 */

interface Status {
  withoutCover: number;
  total: number;
  masterHubConfigured: boolean;
}

interface RunResult {
  generated: number;
  failed: number;
  skipped?: number;
  totalProcessed: number;
  errors?: Array<{ id: string; title: string; error: string }>;
  message?: string;
}

export default function CoverGeneratorClient() {
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [lastRun, setLastRun] = useState<RunResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [force, setForce] = useState(false);
  const [limit, setLimit] = useState(50);
  const { toast } = useToast();

  async function loadStatus() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/cover-regenerate');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setStatus({
        withoutCover: data.withoutCover,
        total: data.total,
        masterHubConfigured: data.masterHubConfigured,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadStatus();
  }, []);

  async function runGenerator() {
    if (running) return;
    setRunning(true);
    setError(null);
    setLastRun(null);
    try {
      const res = await fetch('/api/admin/cover-regenerate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force, limit }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setLastRun(data);
      toast({
        type: 'success',
        message: `Cover run finished: ${data.generated} generated, ${data.failed} failed.`,
      });
      // Status neu laden
      await loadStatus();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
      toast({ type: 'error', message: message || 'Something went wrong.' });
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Status */}
      <AdminCard>
        <p className="font-mono text-[10px] tracking-widest uppercase text-muted mb-3">STATUS</p>
        {loading && !status ? (
          <p className="text-sm text-secondary font-mono">Loading...</p>
        ) : status ? (
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="font-display text-3xl text-rasta-green">{status.withoutCover}</p>
              <p className="font-mono text-[10px] uppercase text-muted tracking-widest">
                Without Cover
              </p>
            </div>
            <div>
              <p className="font-display text-3xl text-rasta-yellow">{status.total}</p>
              <p className="font-mono text-[10px] uppercase text-muted tracking-widest">Total</p>
            </div>
            <div>
              <p
                className={`font-display text-3xl ${
                  status.masterHubConfigured ? 'text-rasta-green' : 'text-rasta-red'
                }`}
              >
                {status.masterHubConfigured ? 'OK' : 'OFF'}
              </p>
              <p className="font-mono text-[10px] uppercase text-muted tracking-widest">
                Generator
              </p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-rasta-red">{error || 'Status unavailable'}</p>
        )}
      </AdminCard>

      {/* Controls */}
      <AdminCard>
        <p className="font-mono text-[10px] tracking-widest uppercase text-muted mb-4">ACTIONS</p>

        <div className="space-y-3 mb-5">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={force}
              onChange={(e) => setForce(e.target.checked)}
              className="h-4 w-4 accent-rasta-green cursor-pointer"
            />
            <span className="text-sm text-foreground font-mono">
              FORCE — regenerate covers for tracks that already have one
            </span>
          </label>
          <label className="flex items-center gap-2">
            <span className="text-sm text-foreground font-mono min-w-[60px]">LIMIT:</span>
            <input
              type="number"
              min={1}
              max={200}
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value) || 50)}
              className={cn(adminInputClass, 'w-24 font-mono')}
            />
            <span className="text-xs text-muted">(max. 200 per run)</span>
          </label>
        </div>

        <AdminButton
          size="lg"
          onClick={runGenerator}
          disabled={!status?.masterHubConfigured}
          isLoading={running}
          className="font-display font-normal tracking-[0.1em] text-sm"
        >
          {!running && <Zap size={16} />}
          {running ? 'GENERATING...' : 'GENERATE COVERS'}
        </AdminButton>
      </AdminCard>

      {/* Error */}
      {error && (
        <AdminCard framed frame="red">
          <p className="font-mono text-xs uppercase tracking-widest text-rasta-red mb-2">ERROR</p>
          <p className="font-mono text-sm text-foreground">{error}</p>
        </AdminCard>
      )}

      {/* Last Run */}
      {lastRun && (
        <AdminCard>
          <p className="font-mono text-[10px] tracking-widest uppercase text-muted mb-3">
            LAST RUN
          </p>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div>
              <p className="font-display text-3xl text-rasta-green">{lastRun.generated}</p>
              <p className="font-mono text-[10px] uppercase text-muted tracking-widest">
                Generated
              </p>
            </div>
            <div>
              <p className="font-display text-3xl text-rasta-red">{lastRun.failed}</p>
              <p className="font-mono text-[10px] uppercase text-muted tracking-widest">Failed</p>
            </div>
            <div>
              <p className="font-display text-3xl text-rasta-yellow">{lastRun.totalProcessed}</p>
              <p className="font-mono text-[10px] uppercase text-muted tracking-widest">
                Processed
              </p>
            </div>
          </div>
          {lastRun.message && (
            <p className="text-sm text-secondary font-mono italic">{lastRun.message}</p>
          )}
          {lastRun.errors && lastRun.errors.length > 0 && (
            <details className="mt-3">
              <summary className="text-xs text-rasta-red font-mono cursor-pointer uppercase tracking-widest">
                {lastRun.errors.length} error{lastRun.errors.length === 1 ? '' : 's'} — details
              </summary>
              <ul className="mt-2 space-y-1 text-xs font-mono text-muted">
                {lastRun.errors.slice(0, 20).map((err, i) => (
                  <li key={i}>
                    <span className="text-rasta-red">[{err.id.slice(0, 8)}]</span>{' '}
                    <span className="text-foreground">{err.title}</span>:{' '}
                    <span className="text-muted">{err.error}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </AdminCard>
      )}
    </div>
  );
}
