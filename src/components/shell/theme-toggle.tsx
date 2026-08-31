'use client';

import { useEffect, useState } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

/**
 * Three themes ship — light, medium and dark — as the design system defines
 * them, plus following the operating system. The choice is stored in
 * `localStorage` and applied by an inline script before first paint, so a
 * reader who chose dark never gets a flash of white.
 */

const THEMES = [
  { id: 'light', label: 'Light', Icon: Sun },
  { id: 'medium', label: 'Medium', Icon: Monitor },
  { id: 'dark', label: 'Dark', Icon: Moon },
] as const;

type Theme = (typeof THEMES)[number]['id'];

export const THEME_STORAGE_KEY = 'amryn-theme';

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    const stored = safeRead();
    setTheme(stored ?? 'light');
  }, []);

  function choose(next: Theme) {
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Private browsing, or site data blocked. The theme still applies for
      // this visit; it simply is not remembered.
    }
  }

  // Nothing is rendered until the effect has read storage, because rendering a
  // "light is selected" state to a reader who chose dark is worse than a beat
  // of empty space.
  if (theme === null) return <div className="size-9" aria-hidden />;

  return (
    <div
      className="flex items-center gap-0.5 rounded-[var(--radius-pill)] bg-[var(--card-inset)] p-0.5"
      role="group"
      aria-label="Colour theme"
    >
      {THEMES.map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          onClick={() => choose(id)}
          aria-pressed={theme === id}
          title={label}
          className={cn(
            'rounded-[var(--radius-pill)] p-1.5 transition-colors',
            theme === id
              ? 'bg-[var(--card)] text-[var(--text-primary)] shadow-[var(--shadow-card)]'
              : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]',
          )}
        >
          <Icon className="size-4" />
          <span className="sr-only">{label}</span>
        </button>
      ))}
    </div>
  );
}

function safeRead(): Theme | null {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY);
    return value === 'light' || value === 'medium' || value === 'dark' ? value : null;
  } catch {
    return null;
  }
}
