import { notFound, redirect } from 'next/navigation';
import { requirePermission } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { DOCUMENTS_BUCKET } from '@/features/data/bucket';
import { ourFault } from '@/lib/errors';

export const dynamic = 'force-dynamic';

/**
 * Opening a file somebody uploaded.
 *
 * A route rather than a server action, so the interface is an ordinary link
 * that works with a middle click, a right-click-save and a screen reader —
 * none of which a button wired to JavaScript gives you.
 *
 * ── why the redirect, and why it expires ─────────────────────────────────
 *
 * The bucket is private, so there is no URL that simply works. This checks who
 * is asking, checks the file belongs to their organisation, and then mints a
 * link that stops working in five minutes. A URL that escaped into an email
 * thread or a shared browser history is then a dead link rather than a
 * customer's bank statement.
 *
 * The organisation filter is not the only defence — the storage policies in
 * migration 37 would refuse the object anyway — but it is the one that turns a
 * cross-tenant request into a plain "not found" instead of an error.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const workspace = await requirePermission('view_data_sources');
  const { id } = await params;

  const supabase = await createClient();
  const { data: document } = await supabase
    .from('data_documents')
    .select('storage_path, filename')
    .eq('id', id)
    .eq('organisation_id', workspace.organisation.id)
    .maybeSingle();

  if (!document) notFound();

  const { data, error } = await supabase.storage
    .from(DOCUMENTS_BUCKET)
    .createSignedUrl(document.storage_path, 300, { download: document.filename });

  if (error || !data) {
    ourFault('documents', error, '');
    notFound();
  }

  redirect(data.signedUrl);
}
