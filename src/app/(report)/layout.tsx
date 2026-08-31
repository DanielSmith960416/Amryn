/**
 * The executive report's own surround — none.
 *
 * The report is a document, not a page of the application: no navigation, no
 * theme switcher, no chrome of any kind, because all of it would either print
 * or have to be hidden from print. `renderReport` emits a complete styled
 * document, so this layout deliberately adds nothing to it.
 */
export default function ReportLayout({ children }: { children: React.ReactNode }) {
  return children;
}
