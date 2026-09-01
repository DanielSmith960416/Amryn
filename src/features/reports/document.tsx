import type { WeeklyBrief } from '@/lib/intelligence/briefing';
import type { Workspace } from '@/lib/workspace';
import { renderReport } from '@/lib/reports/render';

/**
 * The executive report, rendered into the page.
 *
 * `renderReport` already produces a complete, self-contained document — its own
 * styles, its own page rules, no external fonts and no scripts — because it was
 * written to be served whole from an API route. On a static site there is no
 * route to serve it from, so the same string is injected here instead and the
 * output is byte-for-byte what it always was.
 *
 * `dangerouslySetInnerHTML` is the honest tool for that. Nothing in the string
 * comes from a request or from a reader: it is built from the workspace at
 * build time, and every value that reaches it passes through `escapeHtml`.
 */
export function ReportDocument({
  workspace,
  brief,
}: {
  workspace: Workspace;
  brief: WeeklyBrief;
}) {
  const html = renderReport(workspace, brief);

  // Only the document's own body is wanted; the surrounding page already has a
  // head, and nesting a second <html> would be invalid.
  const body = html.slice(html.indexOf('<body>') + '<body>'.length, html.lastIndexOf('</body>'));
  const styles = html.slice(html.indexOf('<style>') + '<style>'.length, html.indexOf('</style>'));

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: styles }} />
      <div dangerouslySetInnerHTML={{ __html: body }} />
    </>
  );
}
