import { useEffect, useState } from 'react';
import { api } from './lib/api';
import type { MetaResponse } from './lib/types';
import { DashboardPage } from './pages/DashboardPage';
import { MethodologyPage } from './pages/MethodologyPage';
import { Spinner } from './components/ui';

type Tab = 'dashboard' | 'methodology';

export default function App() {
  const [tab, setTab] = useState<Tab>('dashboard');
  const [meta, setMeta] = useState<MetaResponse | null>(null);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  function loadMeta() {
    api
      .meta()
      .then(setMeta)
      .catch((err) => setMetaError(err.message));
  }

  useEffect(loadMeta, []);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await api.refresh();
      loadMeta();
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <div>
            <h1 className="text-lg font-bold tracking-tight text-slate-900 dark:text-slate-50">Fourth Quarter</h1>
            <p className="text-xs text-slate-500">
              {meta ? (
                <>
                  {meta.season} season · Week {meta.week}
                  {meta.dataStale && <span className="ml-1 text-amber-600 dark:text-amber-400">(showing cached data)</span>}
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
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            {refreshing && <Spinner />}
            Refresh data
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-6">
        {tab === 'dashboard' ? <DashboardPage meta={meta} /> : <MethodologyPage meta={meta} />}
      </main>

      <footer className="mx-auto max-w-4xl px-4 pb-8 pt-2 text-center text-xs text-slate-400">
        Data via nflverse (CC-BY 4.0) and Pro Football Reference. Not affiliated with the NFL, ESPN, or PFF.
      </footer>
    </div>
  );
}
