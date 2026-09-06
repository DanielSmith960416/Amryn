/**
 * Which migrations can lose data that is already there.
 *
 * The rule this serves: back up before any migration touching existing client
 * records. Enforcing it needs an answer to "does this one?", and the honest
 * answer cannot come from remembering to add a marker — the migration where
 * somebody forgets is exactly the one that needed it.
 *
 * ── why the stripping matters more than the patterns ──────────────────────
 * A naive search for "delete from" flags almost every migration in this
 * repository, because the functions they define contain them:
 * prune_rate_limits() deletes and sweep_jobs() deletes, and defining a
 * function that will one day delete something is not the same as deleting it
 * now. So comments and dollar-quoted bodies come out first, and what is left
 * is the statements the migration actually executes when it runs.
 *
 * Kept as plain JavaScript because the migration runner is a script with no
 * build step, and one implementation that both it and the tests read is worth
 * more than a tidier language.
 */

/**
 * Removes comments and dollar-quoted bodies, leaving executable statements.
 *
 * Dollar quoting is handled by tag, not by counting `$$`: a body opened with
 * `$setup$` is not closed by a `$$` inside it, and the generated setup.sql
 * uses exactly that to nest one.
 */
export function strip(sql) {
  let out = '';
  let i = 0;

  while (i < sql.length) {
    // A dollar-quoted body: skip to its matching tag.
    const dollar = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(i));
    if (dollar) {
      const tag = dollar[0];
      const end = sql.indexOf(tag, i + tag.length);
      i = end === -1 ? sql.length : end + tag.length;
      // A space, so the text either side does not fuse into a false match.
      out += ' ';
      continue;
    }

    if (sql.startsWith('--', i)) {
      const end = sql.indexOf('\n', i);
      i = end === -1 ? sql.length : end;
      continue;
    }

    if (sql.startsWith('/*', i)) {
      const end = sql.indexOf('*/', i + 2);
      i = end === -1 ? sql.length : end + 2;
      out += ' ';
      continue;
    }

    // A single-quoted literal, so an apostrophe in a comment string cannot
    // swallow the rest of the file.
    if (sql[i] === "'") {
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === "'" && sql[j + 1] === "'") j += 2;
        else if (sql[j] === "'") break;
        else j += 1;
      }
      i = j + 1;
      out += ' ';
      continue;
    }

    out += sql[i];
    i += 1;
  }

  return out;
}

/**
 * Statements that can change or destroy rows that already exist.
 *
 * Adding a table, a column, an index, a policy or a function cannot: a
 * migration that only adds is safe to apply to a live database and is the
 * shape every migration here is supposed to have. Anything on this list is
 * either destructive or rewrites existing rows, and is what the backup rule is
 * about.
 */
const RISKS = [
  { what: 'drops a table', re: /\bdrop\s+table\b/i },
  { what: 'drops a column', re: /\bdrop\s+column\b/i },
  { what: 'drops a schema', re: /\bdrop\s+schema\b/i },
  { what: 'truncates a table', re: /\btruncate\b/i },
  { what: 'changes a column type', re: /\balter\s+column\s+\w+\s+(set\s+data\s+)?type\b/i },
  { what: 'renames a column', re: /\brename\s+column\b/i },
  { what: 'renames a table', re: /\balter\s+table\s+[\w."]+\s+rename\s+to\b/i },
  {
    what: 'updates existing rows',
    // The optional alias is not decoration: migration 16 writes
    // `update public.subscriptions s set …`, and a pattern without it reports
    // that migration as purely additive — a false negative on exactly the kind
    // of statement this list exists to catch.
    re: /\bupdate\s+(?:only\s+)?[\w."]+(?:\s+(?:as\s+)?[a-z_][a-z0-9_]*)?\s+set\b/i,
  },
  { what: 'deletes rows', re: /\bdelete\s+from\b/i },
];

/** Every reason this migration is not purely additive. Empty means it is. */
export function riskyStatements(sql) {
  const executable = strip(sql);
  return RISKS.filter(({ re }) => re.test(executable)).map(({ what }) => what);
}
