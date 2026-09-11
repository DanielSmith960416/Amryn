/**
 * Putting a dump somewhere a deployment container cannot lose it.
 *
 * The pre-deploy command has no volume — Railway does not mount them at that
 * point — so a backup taken there has to leave the container or it may as well
 * not exist. This is how it leaves: a PUT to a private Supabase Storage
 * bucket, using the service role the worker already holds.
 *
 * Plain fetch rather than the Supabase client, for the reason every script in
 * this directory is written the way it is: these run from a terminal with
 * nothing installed, and a build step between an operator and their backup is
 * a step that can fail at the worst moment.
 *
 * ── what this is worth, stated once ──────────────────────────────────────
 *
 * A dump in the same project it came from is complete protection against a
 * migration statement that goes wrong, and no protection at all against losing
 * the project. Both halves are true and the second is not a reason to skip the
 * first.
 */
export const BUCKET = 'backups';

/** Both settings, or null with nothing half-configured. */
export function storageSettings() {
  const url = (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
  if (url === '' || key === '') return null;
  return { url: url.replace(/\/+$/, ''), key };
}

/**
 * Uploads the dump and returns where it went.
 *
 * @throws Error with a sentence an operator can act on. The caller decides
 *         whether that is fatal — for migrate.mjs it is, because the whole
 *         point was to have a backup before proceeding.
 */
export async function uploadDump(contents, objectName, settings) {
  const response = await fetch(
    `${settings.url}/storage/v1/object/${BUCKET}/${encodeURIComponent(objectName)}`,
    {
      method: 'POST',
      headers: {
        apikey: settings.key,
        Authorization: `Bearer ${settings.key}`,
        'Content-Type': 'application/sql',
        // Never overwrite. Two dumps at one instant is a collision worth
        // failing on, not a file worth replacing.
        'x-upsert': 'false',
      },
      body: contents,
    },
  );

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    if (response.status === 404) {
      throw new Error(
        `the ${BUCKET} bucket does not exist — migration 41 creates it, so the database is behind`,
      );
    }
    throw new Error(`storage refused the upload (${response.status}) ${detail.slice(0, 200)}`);
  }

  return `${BUCKET}/${objectName}`;
}
