export type Theme = 'light' | 'dark';

/** The stored choice if valid, otherwise the system preference. */
export function resolveTheme(stored: string | null, prefersDark: boolean): Theme {
  if (stored === 'light' || stored === 'dark') return stored;
  return prefersDark ? 'dark' : 'light';
}

export const toggleTheme = (t: Theme): Theme => (t === 'dark' ? 'light' : 'dark');
