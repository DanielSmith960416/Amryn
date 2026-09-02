# ═══════════════════════════════════════════════════════════════════════════
# Amryn™ AIGrowthIntelligence® — application image
# ═══════════════════════════════════════════════════════════════════════════
#
# Runs on Railway, behind Cloudflare. Three stages, for one reason each:
# install with the lockfile, build with the whole source, run with neither.
#
# ── the part that surprises people ────────────────────────────────────────
# NEXT_PUBLIC_* values are inlined into the browser bundle at BUILD time, not
# read at run time. Setting NEXT_PUBLIC_SUPABASE_URL only in the service's
# runtime environment produces an image whose JavaScript carries `undefined`
# where the URL should be, and the first symptom is "Invalid API key" on the
# sign-in page — a message about a key, caused by a missing URL.
#
# So they are build arguments as well as environment variables. Railway passes
# service variables to the build automatically; anywhere else, pass them with
# --build-arg or the image will be wrong in a way nothing in it can report.
#
# Nothing secret is a build argument. The two that appear here are public by
# design — they are in the browser bundle either way — and the service role
# key, the SMTP password and the AI key are read at run time only, so they
# never enter an image layer.

# ── dependencies ──────────────────────────────────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app

# The lockfile alone, so this layer is rebuilt only when dependencies change
# rather than on every source edit.
COPY package.json package-lock.json ./
RUN npm ci

# ── build ─────────────────────────────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app

ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL

# Telemetry off. Not a privacy gesture so much as one fewer network call from
# a build that should be able to run with the network closed.
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npm run build

# ── run ───────────────────────────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Not root. A compromised render should not also be a compromised container.
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

# `output: 'standalone'` emits a server with only the dependencies it actually
# uses — a few hundred megabytes of node_modules do not travel with it. The
# two directories beside it are not included and have to be copied by hand:
# Next's own documentation is easy to miss on this, and the symptom of missing
# `.next/static` is a site that renders with no styling at all.
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=build --chown=nextjs:nodejs /app/public ./public

# The migration runner and its inputs. /setup applies migrations over a direct
# connection, and `railway run node scripts/migrate.mjs` does the same from a
# terminal — neither works if the SQL is not in the image.
#
# No node_modules to copy alongside them: the application itself imports `pg`,
# so tracing has already put it in the standalone tree, and migrate.mjs
# resolves it from there. Listing pg's dependencies by hand here would be a
# copy of npm's job that goes stale the first time one of them is renamed.
COPY --from=build --chown=nextjs:nodejs /app/scripts ./scripts
COPY --from=build --chown=nextjs:nodejs /app/supabase/migrations ./supabase/migrations

USER nextjs
EXPOSE 3000

# server.js is what standalone emits. Not `next start`: the CLI is not in this
# image, deliberately.
CMD ["node", "server.js"]
