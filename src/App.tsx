import { useEffect, useState } from 'react';
import { api } from './lib/api';
import type { MetaResponse } from './lib/types';
import { DashboardPage } from './pages/DashboardPage';
import { MethodologyPage } from './pages/MethodologyPage';

type Tab = 'dashboard' | 'methodology';

function formatGeneratedAt(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const hours = Math.round(diffMs / (60 * 60 * 1000));
  if (hours < 1) return 'less than an hour ago';
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export default function App() {
  const [tab, setTab] = useState<Tab>('dashboard');
  const [meta, setMeta] = useState<MetaResponse | null>(null);
  const [metaError, setMetaError] = useState<string | null>(null);

  useEffect(() => {
    api
      .meta()
      .then(setMeta)
      .catch((err) => setMetaError(err.message));
  }, []);

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <div>
            <h1 className="text-lg font-bold tracking-tight text-slate-900 dark:text-slate-50">Fourth Quarter</h1>
            <p className="text-xs text-slate-500">
              {meta ? (
                <>
                  {meta.season} season · Week {meta.week} · data generated {formatGeneratedAt(meta.generatedAt)}
                </>
              ) : metaError ? (
                <span className="text-red-600">{metaError}</span>
              ) : (
                'Loading…'
              )}
            </p>
          </div>
          <nav className="flex items-center gap-1 rounded-xl bg-slate-100 p-1 text-sm dark:bg-slate-800">
            <button
              onClick={() => setTab('dashboard')}
              className={`rounded-lg px-3 py-1.5 font-medium transition ${
                tab === 'dashboard'
                  ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white'
                  : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              Dashboard
            </button>
            <button
              onClick={() => setTab('methodology')}
              className={`rounded-lg px-3 py-1.5 font-medium transition ${
                tab === 'methodology'
                  ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white'
                  : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              Methodology
            </button>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-6">
        {tab === 'dashboard' ? <DashboardPage /> : <MethodologyPage meta={meta} />}
      </main>

      <footer className="mx-auto max-w-4xl px-4 pb-8 pt-2 text-center text-xs text-slate-400">
        Data via nflverse (CC-BY 4.0) and Pro Football Reference. Not affiliated with the NFL, ESPN, or PFF.
      </footer>
    </div>
  );
}
