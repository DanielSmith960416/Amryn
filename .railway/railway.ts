/**
 * The Railway project, as a file.
 *
 * Replaces railway.json, which Railway stops reading on 2026-12-01. That
 * deadline is the whole reason this exists: on the day it passes, a service
 * whose builder came only from railway.json falls back to Railpack, and a
 * Railpack image of this repository has no dist/worker.mjs, no scripts/ and no
 * supabase/migrations/ in it. The web service would keep serving pages and the
 * worker would stop being deployable, which is a bad way to find out.
 *
 * ── how this file is used, and how it is not ──────────────────────────────
 *
 * Nothing reads it at deploy time. It is evaluated only by the Railway CLI,
 * which compares it against the live environment and shows a plan before
 * changing anything. Committing it changes nothing on its own; applying it
 * does. See docs-internal/DEPLOYMENT.md for the cutover.
 *
 * ── omit means delete ─────────────────────────────────────────────────────
 *
 * This is the property to keep in mind when editing. A resource or variable
 * that is not named here is one the next apply will remove. That is why every
 * variable is listed, and why they are listed as preserve() rather than as
 * values: preserve() means "keep what Railway already has", so the eleven
 * settings between these two services stay where they are, out of source
 * control, and are neither printed in a plan nor committed to this repository.
 *
 * Generated *.up.railway.app domains are deliberately absent — Railway does
 * not manage those through this file, so naming one here would be inventing a
 * resource rather than describing one.
 *
 * ── do not declare a value that equals the platform default ───────────────
 *
 * Railway does not store a field left at its default, so a plan compares the
 * declared value against nothing and reports the same change on every run.
 * The apply succeeds and the next plan asks for it again. Measured, not
 * guessed: that is what `deploy.restartPolicyType` did after #85.
 *
 * A plan that is never empty is a review gate people stop reading, which
 * costs more than the setting was ever worth. Declare what differs.
 */
import { defineRailway, github, preserve, project, service, volume } from 'railway/iac';

/**
 * Both services build the same Dockerfile from the same commit.
 *
 * Shared so the two cannot drift, which is the fault this whole file is
 * closing. They are still two separate builds — one per service — which is why
 * a split deploy remains possible and why the worker heartbeat carries its
 * handler list for /diagnostics to compare.
 */
const DOCKER_BUILD = {
  builder: 'DOCKERFILE',
  buildEnvironment: 'V3',
  dockerfilePath: 'Dockerfile',
} as const;

/** One repository, one branch, both services. */
const SOURCE = github('DanielSmith960416/Amryn', { branch: 'main', checkSuites: false });

export default defineRailway(() => {
  /**
   * Where the nightly database dumps live.
   *
   * The deployment container's filesystem is discarded, so a dump written
   * inside it exists for exactly as long as it is useless. This outlives the
   * container, which is what makes an automated backup a backup at all.
   *
   * Attached to the worker, because that is what takes the dump. A volume can
   * only be attached to one service, and it belongs to the one that writes it.
   *
   * Sized well beyond need: a dump of this database is under a megabyte today
   * and the retention window keeps fourteen. Growing a volume is a live,
   * zero-downtime operation; shrinking one is not supported at all, so the
   * asymmetry says start small rather than large.
   *
   * ── why the name is not simply `backups` ──────────────────────────────
   *
   * The first apply of this file reported success and created a volume named
   * `backups` that never attached to anything and does not appear in the
   * environment — visible only as a name collision when another volume tried
   * to take it. The working volume was created directly and named
   * `amryn-backups`, and this file names that one.
   *
   * The alternative was to declare `backups` and let a future plan reconcile
   * the two. That plan could reasonably have proposed detaching or deleting
   * the volume holding the backups, which is the one change nobody should be
   * asked to approve in a hurry. A name nothing else claims avoids the
   * question entirely.
   */
  const backups = volume('amryn-backups', {
    // Where the services run. A volume in another region would work and would
    // add a round trip to every write for no benefit.
    region: 'ams',
    sizeMB: 512,
  });

  /**
   * The web service. `node server.js` rather than `next start`: the CLI is
   * deliberately not in the image, and server.js is what `output: 'standalone'`
   * emits.
   */
  const web = service('Amryn', {
    source: SOURCE,
    build: DOCKER_BUILD,
    deploy: {
      startCommand: 'node server.js',
      // /api/health/live answers without touching the database, so a
      // deployment is not held back by Supabase being unreachable.
      healthcheckPath: '/api/health/live',
      healthcheckTimeout: 120,
      // Three attempts rather than the default ten. Declared because it
      // differs from the default; see the note below on why the policy *type*
      // is not declared beside it.
      restartPolicyMaxRetries: 3,
      multiRegionConfig: { ams: { numReplicas: 1 } },
    },
    variables: {
      INTERNAL_ACCESS_TOKEN: preserve(),
      NEXT_PUBLIC_SITE_URL: preserve(),
      NEXT_PUBLIC_SUPABASE_ANON_KEY: preserve(),
      NEXT_PUBLIC_SUPABASE_URL: preserve(),
      PORT: preserve(),
      // The direct connection, which is what /setup applies migrations over
      // and what /diagnostics reads the worker's heartbeat over. Without it
      // that page cannot tell whether the worker is running — it says so
      // rather than guessing, but saying so is not the same as knowing.
      //
      // preserve() and never a literal: this is the database owner's
      // connection string, and Row Level Security does not stand between it
      // and anything.
      SUPABASE_DB_URL: preserve(),
      SMTP_FROM: preserve(),
      SMTP_HOST: preserve(),
      SMTP_PASSWORD: preserve(),
      SMTP_PORT: preserve(),
      SMTP_USER: preserve(),
    },
  });

  /**
   * The worker. Same image, different command.
   *
   * No healthcheck, on purpose: it serves no HTTP at all, so a healthcheck
   * could never pass and every deploy would be rolled back on a service that
   * was working perfectly. Liveness is reported through worker_heartbeats
   * instead, which /diagnostics reads.
   *
   * preDeployCommand is the ordering fix. It runs between the build and the
   * start, so the worker never comes up against a schema it is ahead of. It
   * exits 0 when there is nothing to apply and takes an advisory lock, so
   * running it on every release — including releases that change no
   * migration — is safe.
   */
  const worker = service('Amryn Worker', {
    source: SOURCE,
    build: DOCKER_BUILD,
    deploy: {
      startCommand: 'node dist/worker.mjs',
      preDeployCommand: ['node scripts/migrate.mjs'],
      /*
       * No restart policy declared, and that is the correct entry.
       *
       * The runbook asks for ON_FAILURE with ten attempts. Railway's default
       * is ON_FAILURE with ten attempts, so the service already has exactly
       * that — "no policy reported" is the default being in force, not the
       * absence of one.
       *
       * Declaring it anyway does not make it more true. A field whose value
       * equals the platform default is not stored, so the next plan compares
       * a declared value against nothing and reports the same change again,
       * forever. That was measured: #85 applied
       * `~ Update Amryn deploy.restartPolicyType` successfully and the very
       * next plan asked for it again.
       *
       * A plan that always shows a phantom change is worse than no plan. It
       * is the review gate for every future change to this file, and a gate
       * that is never empty is one people stop reading.
       */
      multiRegionConfig: { ams: { numReplicas: 1 } },
    },
    volumeMounts: {
      '/backups': backups,
    },
    variables: {
      SUPABASE_DB_URL: preserve(),
      /*
       * Run as root — on this service only, and for one reason.
       *
       * Railway mounts a volume as root. An image running as a non-root uid
       * cannot write to one, and there is no way around it: the mount shadows
       * whatever ownership the image prepared, and uid 1001 cannot chown a
       * root-owned mount. Railway documents this variable as the remedy.
       *
       * The Dockerfile's reason for running as nextjs is that a compromised
       * *render* should not also be a compromised container. This service
       * renders nothing and serves no HTTP at all — no requests, no sessions,
       * no user input reaching a template. What it has is the database
       * credentials it already needed to do its job.
       *
       * The web service, which does have a request surface, keeps running as
       * nextjs. That is the half of the trade worth protecting.
       */
      RAILWAY_RUN_UID: '0',
      /*
       * The mail settings, so the morning brief can actually be delivered.
       *
       * brief.compose runs on the worker, and a worker with no mail settings
       * composes the brief correctly and then records email_skipped — the
       * brief exists, nobody is told about it, and nothing is broken enough
       * to notice. SMTP_HOST and SMTP_FROM are the two that decide it; the
       * rest tune the connection.
       *
       * References to the web service's copies rather than second literals,
       * so each credential is defined once. The cost is a coupling in both
       * directions — the web service reads SUPABASE_DB_URL from this one —
       * so renaming either service breaks the other's variables. Worth
       * knowing before renaming anything.
       */
      SMTP_HOST: preserve(),
      SMTP_FROM: preserve(),
      SMTP_PORT: preserve(),
      SMTP_USER: preserve(),
      SMTP_PASSWORD: preserve(),
    },
  });

  return project('satisfied-stillness', {
    // The volume is listed beside the services because omission deletes: a
    // resource absent from here is one the next apply removes, and this one
    // holds the backups.
    resources: [web, worker, backups],
  });
});
