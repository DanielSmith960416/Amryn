'use client';

import { useEffect, useState } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

/** The three themes the specification calls for, plus following the system. */
const THEMES = [
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'medium', label: 'Medium', Icon: Monitor },
  { value: 'dark', label: 'Dark', Icon: Moon },
] as const;

type Theme = (typeof THEMES)[number]['value'];

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);

  // Read after mount: the pre-paint script has already applied the attribute,
  // and reading localStorage during render would break hydration.
  useEffect(() => {
    const attribute = document.documentElement.getAttribute('data-theme');
    if (attribute === 'light' || attribute === 'medium' || attribute === 'dark') {
      setTheme(attribute);
    }
  }, []);

  function choose(next: Theme) {
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem('amryn.theme', next);
    } catch {
      // Storage can be unavailable; the choice still applies to this session.
    }
  }

  return (
    <div
      className="flex items-center gap-0.5 rounded-[var(--radius-pill)] border border-[var(--border)] p-0.5"
      role="group"
      aria-label="Theme"
    >
      {THEMES.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          onClick={() => choose(value)}
          aria-pressed={theme === value}
          title={`${label} theme`}
          className={cn(
            'flex size-7 items-center justify-center rounded-[var(--radius-pill)] transition-colors',
            theme === value
              ? 'bg-[var(--brand)] text-[var(--on-brand)]'
              : 'text-[var(--text-tertiary)] hover:bg-[var(--card-inset)] hover:text-[var(--text-primary)]',
          )}
        >
          <Icon className="size-3.5" aria-hidden />
          <span className="sr-only">{label}</span>
        </button>
      ))}
    </div>
  );
}
