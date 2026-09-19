import React from 'react';

export function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 ${className}`}
    >
      {children}
    </div>
  );
}

const LEAN_STYLES: Record<string, string> = {
  'Strong Start': 'bg-field-500 text-white dark:bg-field-600',
  Start: 'bg-field-100 text-field-800 dark:bg-field-900/70 dark:text-field-200',
  Flex: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200',
  Bench: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200',
  Avoid: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200',
};

export function LeanBadge({ lean, score }: { lean: string; score: number }) {
  return (
    <div
      className={`inline-flex shrink-0 items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold ${
        LEAN_STYLES[lean] ?? 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'
      }`}
    >
      <span>{lean}</span>
      <span className="text-xs font-normal opacity-70">{score.toFixed(0)}/100</span>
    </div>
  );
}

export function PercentileBar({ value }: { value: number }) {
  const clamped = Math.max(0, Math.min(100, value));
  const color = clamped >= 60 ? 'bg-field-500' : clamped >= 40 ? 'bg-amber-400' : 'bg-red-400';
  return (
    <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800">
      <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${clamped}%` }} />
    </div>
  );
}

export function Spinner({ className = '' }: { className?: string }) {
  return (
    <div
      className={`h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600 dark:border-slate-700 dark:border-t-slate-300 ${className}`}
    />
  );
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">{children}</h4>;
}
