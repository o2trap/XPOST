import type { MeResponse } from '@xpost/shared';
import { revokeSession, signOut } from './api';

const when = (ms: number | null) => (ms === null ? 'never' : new Date(ms).toLocaleString());

const STATUS_LABEL: Record<MeResponse['licence']['status'], string> = {
  active: 'Active', inactive: 'Paused', expired: 'Expired', disabled: 'Disabled', refunded: 'Refunded',
};

export function Account({ me, onChange, onSignedOut }: { me: MeResponse; onChange: () => void; onSignedOut: () => void }) {
  const { licence } = me;
  const box = 'rounded-md border border-slate-200 p-4 dark:border-slate-800';
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm">Signed in as <span className="font-medium">{me.user.email}</span></p>
        <button type="button" onClick={async () => { await signOut(); onSignedOut(); }} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-700">Sign out</button>
      </div>

      <section className={box} aria-label="Licence">
        <h2 className="mb-2 font-semibold">Licence</h2>
        <p className="text-sm">Status: <span data-testid="licence-status" className="font-medium">{STATUS_LABEL[licence.status]}</span> · key …{licence.keyLast4}</p>
        <p className="text-sm text-slate-600 dark:text-slate-400">Expires: {licence.expiresAt ? when(licence.expiresAt) : 'no expiry'} · last checked {when(licence.lastValidatedAt)}</p>
        {licence.message && (
          <p role={licence.canPost ? 'status' : 'alert'} className={`mt-3 rounded-md p-3 text-sm ${licence.canPost ? 'bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200' : 'bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200'}`}>
            {licence.message}
          </p>
        )}
      </section>

      <section className={box} aria-label="Sessions">
        <h2 className="mb-2 font-semibold">Signed-in browsers</h2>
        <p className="mb-3 text-sm text-slate-600 dark:text-slate-400">Up to {me.limits.maxWebSessions} at a time. Signing in on another one signs out the oldest.</p>
        <ul className="flex flex-col gap-2">
          {me.sessions.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-3 text-sm">
              <span>
                {s.userAgent ?? 'Unknown browser'}{s.current && <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs dark:bg-slate-800">this one</span>}
                <span className="block text-xs text-slate-500">Last active {when(s.lastSeenAt)}</span>
              </span>
              <button type="button" onClick={async () => { await revokeSession(s.id); s.current ? onSignedOut() : onChange(); }} className="rounded-md border border-slate-300 px-2 py-1 text-xs dark:border-slate-700">
                Sign out
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
