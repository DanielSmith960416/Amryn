'use client';

import { useEffect, useState } from 'react';
import { isTheme, THEME_STORAGE_KEY, THEMES, type Theme } from './theme';
import { Contrast, Sun } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

/**
 * Light or medium, plus whatever was chosen last time.
 *
 * The choice is stored in `localStorage` and applied by an inline script
 * before first paint, so a reader who chose medium never gets a flash of the
 * lighter one.
 *
 * The list itself lives in ./theme so this control and the pre-paint script
 * cannot drift apart; only the icons are decided here.
 */
/* Two suns at 16px are the same icon twice. Contrast's half-filled disc says
   "the same screen, a stop deeper", which is what medium actually is. */
const ICONS: Record<Theme, { label: string; Icon: typeof Sun }> = {
  light: { label: 'Light', Icon: Sun },
  medium: { label: 'Medium', Icon: Contrast },
};

// Re-exported so existing importers keep working; defined in ./theme,
// which is not a client module — see the note there.
export { THEME_STORAGE_KEY } from './theme';

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    setTheme(safeRead() ?? 'light');
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
  // "light is selected" state to a reader who chose medium is worse than a
  // beat of empty space.
  if (theme === null) return <div className="size-9" aria-hidden />;

  return (
    <div
      className="glass-rail flex items-center gap-0.5 p-0.5"
      role="group"
      aria-label="Colour theme"
    >
      {THEMES.map((id) => {
        const { label, Icon } = ICONS[id];
        return (
          <button
            key={id}
            type="button"
            onClick={() => choose(id)}
            aria-pressed={theme === id}
            title={label}
            className={cn(
              'rounded-[var(--radius-pill)] p-1.5 transition-colors',
              theme === id
                ? 'bg-[var(--glass-strong)] text-[var(--text-primary)] shadow-[var(--glass-shadow)]'
                : 'text-[var(--text-tertiary)] hover:bg-[var(--glass-inset)] hover:text-[var(--text-secondary)]',
            )}
          >
            <Icon className="size-4" />
            <span className="sr-only">{label}</span>
          </button>
        );
      })}
    </div>
  );
}

function safeRead(): Theme | null {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY);
    return isTheme(value) ? value : null;
  } catch {
    return null;
  }
}
