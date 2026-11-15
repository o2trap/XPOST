import { useState, type FormEvent } from 'react';
import { signIn } from './api';

export function SignIn({ onSignedIn }: { onSignedIn: () => void }) {
  const [email, setEmail] = useState('');
  const [licenceKey, setLicenceKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await signIn(email, licenceKey);
    setBusy(false);
    if (r.ok) onSignedIn();
    else setError(r.error.message);
  }

  const input = 'w-full rounded-md border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900';
  return (
    <form onSubmit={submit} className="flex flex-col gap-4" aria-label="Sign in">
      <h2 className="text-xl font-semibold">Sign in</h2>
      <p className="text-sm text-slate-600 dark:text-slate-400">Use the email you bought xpost with and the licence key from your Lemon Squeezy receipt.</p>
      <label className="flex flex-col gap-1 text-sm">
        Purchase email
        <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={input} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Licence key
        <input required autoComplete="off" spellCheck={false} value={licenceKey} onChange={(e) => setLicenceKey(e.target.value)} className={`${input} font-mono`} />
      </label>
      {error && <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">{error}</p>}
      <button type="submit" disabled={busy} className="rounded-md bg-slate-900 px-4 py-2 font-medium text-white disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900">
        {busy ? 'Checking…' : 'Sign in'}
      </button>
    </form>
  );
}
