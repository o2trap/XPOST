import { useCallback, useEffect, useState } from 'react';
import type { MeResponse } from '@scatterit/shared';
import { resolveTheme, toggleTheme, type Theme } from './theme';
import { getMe } from './api';
import { SignIn } from './SignIn';
import { Account } from './Account';

function initialTheme(): Theme {
  let stored: string | null = null;
  try { stored = localStorage.getItem('scatterit-theme'); } catch { /* storage unavailable */ }
  return resolveTheme(stored, window.matchMedia('(prefers-color-scheme: dark)').matches);
}

export function App() {
  const [theme, setTheme] = useState<Theme>(initialTheme);
  // undefined = loading, null = signed out
  const [me, setMe] = useState<MeResponse | null | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const r = await getMe();
    if (r.ok) { setMe(r.data); setLoadError(null); }
    else if (r.status === 401) { setMe(null); setLoadError(null); }
    else { setMe(null); setLoadError(r.error.message); }
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    try { localStorage.setItem('scatterit-theme', theme); } catch { /* storage unavailable */ }
  }, [theme]);

  useEffect(() => { void refresh(); }, [refresh]);

  return (
    <main className="min-h-screen bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-10 sm:py-16">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">SCATTERit</h1>
          <button
            type="button"
            onClick={() => setTheme(toggleTheme(theme))}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            {theme === 'dark' ? 'Light mode' : 'Dark mode'}
          </button>
        </div>
        <p className="text-slate-600 dark:text-slate-400">Write once, post everywhere.</p>
        {loadError && <p role="alert" className="text-sm text-red-700 dark:text-red-300">{loadError}</p>}
        {me === undefined ? <p className="text-sm text-slate-500">Loading…</p>
          : me === null ? <SignIn onSignedIn={refresh} />
          : <Account me={me} onChange={refresh} onSignedOut={() => setMe(null)} />}
      </div>
    </main>
  );
}
