import type { Message } from './smtp';
import { RESPONSIBLE_PARTY, hasUnfilledDetails } from '@/lib/legal/documents';

const KIND_SUBJECT: Record<string, string> = {
  export: 'Request for a copy of personal information',
  deletion: 'Request for deletion of personal information',
  correction: 'Request to correct personal information',
};

/**
 * Telling the Information Officer that somebody has exercised a right.
 *
 * Without this the platform records a request, promises an answer within 30
 * days, and puts it in a table nobody has a reason to open. A clock nobody can
 * hear is not a commitment — it is a way of appearing to have one, which under
 * POPIA is worse than the honest alternative of saying "write to us".
 *
 * Returns undefined when there is nowhere to send it: the Information Officer
 * is a placeholder until somebody fills it in, and mailing
 * "[INFORMATION OFFICER EMAIL]" would fail on every request while looking like
 * it worked.
 */
export function dataRequestNotice(request: DataRequestNotice): Message | undefined {
  if (hasUnfilledDetails()) return undefined;
  return buildDataRequestNotice(RESPONSIBLE_PARTY.informationOfficerEmail, request);
}

export interface DataRequestNotice {
  kind: string;
  requesterEmail: string;
  note?: string | null;
  requestedAt: string;
}

/**
 * The message itself, addressed to whoever is given.
 *
 * Separate from the guard above so that it can be tested for what it says
 * rather than only for whether it exists. A test that reconstructs the wording
 * to compare against is a test of its own copy of the logic.
 */
export function buildDataRequestNotice(to: string, request: DataRequestNotice): Message {
  const subject = KIND_SUBJECT[request.kind] ?? 'Data subject request';
  const due = new Date(request.requestedAt);
  due.setDate(due.getDate() + 30);
  const dueDate = due.toISOString().slice(0, 10);

  const lines = [
    `${request.requesterEmail} has made a request under POPIA.`,
    '',
    `Type:      ${subject}`,
    `Received:  ${request.requestedAt.slice(0, 10)}`,
    `Answer by: ${dueDate}`,
  ];

  if (request.note) lines.push('', 'What they said:', request.note);

  lines.push(
    '',
    'The request is recorded against their account. Section 24 requires a response',
    'within a reasonable time, and this platform has promised 30 days.',
  );

  const text = lines.join('\n');

  return {
    to,
    subject: `[Amryn] ${subject} — answer by ${dueDate}`,
    text,
    html: `<pre style="font:14px/1.6 ui-monospace,monospace;white-space:pre-wrap">${escapeHtml(text)}</pre>`,
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
