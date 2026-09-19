import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import type { PlayerCandidate } from '../lib/types';
import { Spinner } from './ui';

export function PlayerSearch({ onAdd }: { onAdd: (p: PlayerCandidate) => void }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<PlayerCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(() => {
      api
        .searchPlayers(q)
        .then((res) => setResults(res.results))
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [q]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const showDropdown = open && q.trim().length >= 2;

  return (
    <div className="relative" ref={boxRef}>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => setOpen(true)}
        placeholder="Add a player by name…"
        className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-field-500 focus:ring-1 focus:ring-field-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
      />
      {showDropdown && (
        <div className="absolute z-10 mt-1 max-h-80 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg dark:border-slate-800 dark:bg-slate-900">
          {loading && (
            <div className="flex items-center gap-2 px-4 py-3 text-sm text-slate-500">
              <Spinner /> Searching…
            </div>
          )}
          {!loading && results.length === 0 && <div className="px-4 py-3 text-sm text-slate-500">No matches.</div>}
          {!loading &&
            results.map((p) => (
              <button
                key={p.gsisId}
                onClick={() => {
                  onAdd(p);
                  setQ('');
                  setResults([]);
                  setOpen(false);
                }}
                className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <span className="font-medium text-slate-800 dark:text-slate-100">{p.name}</span>
                <span className="text-xs text-slate-500">
                  {p.position} · {p.team}
                  {p.status !== 'ACT' ? ` · ${p.status}` : ''}
                </span>
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
