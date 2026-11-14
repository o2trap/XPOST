import { useEffect, useState } from 'react';
import type { HealthResponse } from '@xpost/shared';
import { resolveTheme, toggleTheme, type Theme } from './theme';

function initialTheme(): Theme {
  let stored: string | null = null;
  try { stored = localStorage.getItem('xpost-theme'); } catch { /* storage unavailable */ }
  return resolveTheme(stored, window.matchMedia('(prefers-color-scheme: dark)').matches);
}

export function App() {
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [status, setStatus] = useState<string>('checking...');

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    try { localStorage.setItem('xpost-theme', theme); } catch { /* storage unavailable */ }
  }, [theme]);

  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json() as Promise<HealthResponse>)
      .then((h) => setStatus(h.ok ? `ok (v${h.version})` : 'down'))
      .catch(() => setStatus('unreachable'));
  }, []);

  return (
    <main className="min-h-screen bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-10 sm:py-16">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">xpost</h1>
          <button
            type="button"
            onClick={() => setTheme(toggleTheme(theme))}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            {theme === 'dark' ? 'Light mode' : 'Dark mode'}
          </button>
        </div>
        <p className="text-slate-600 dark:text-slate-400">Write once, post everywhere.</p>
        <p className="text-sm">API status: <span data-testid="status" className="font-mono">{status}</span></p>
      </div>
    </main>
  );
}
