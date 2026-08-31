import { PlatformGuard } from '@/components/shell/platform-guard';

/**
 * The client area.
 *
 * The guard runs in the browser rather than here, because a static export has
 * no server to run it on. Every page beneath this layout is still rendered to
 * HTML at build time from the demonstration workspace — the guard decides what
 * is shown, not what exists.
 */
export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  return <PlatformGuard>{children}</PlatformGuard>;
}
