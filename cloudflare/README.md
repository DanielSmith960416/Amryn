# Cloudflare routing

`www.amryn.ai` is served by two different origins:

| Path | Origin | What it is |
| --- | --- | --- |
| `/app/*` | Railway | The platform — Next.js, built with `basePath: '/app'` |
| everything else | GitHub Pages | The marketing site, published from `docs/` |

`app-router.js` is what makes that split. Cloudflare runs it in front of the
hostname; it forwards `/app/*` to Railway and lets everything else fall through
to Pages.

## Why a Worker

Routing by path to a second origin needs two Cloudflare overrides — the
resolved DNS record, and the `Host` header, which is how Railway decides which
service a request belongs to. Cloudflare offers both through Origin Rules and
lists both as **Enterprise-only**; below that plan only the destination-port
override is available, which does not help. A Worker route is available on the
free plan and does the same job.

## What has to be true

1. **`www.amryn.ai` is a proxied (orange-cloud) DNS record.** A Worker route
   only fires on proxied records. Point it at GitHub Pages:

   | Type | Name | Value | Proxy |
   | --- | --- | --- | --- |
   | CNAME | `www` | `danielsmith960416.github.io` | Proxied |

2. **SSL/TLS encryption mode is Full (strict).** Both GitHub Pages and Railway
   present valid certificates, so nothing looser is warranted.

3. **The repository's Pages custom domain is `www.amryn.ai`**
   (Settings → Pages → Custom domain).

4. **The apex redirects to `www`.** A Redirect Rule on `amryn.ai/*` →
   `https://www.amryn.ai/${1}`, 301. Available on every plan. Requires a
   proxied placeholder record for the apex — an `AAAA` for `@` pointing at
   `100::` is the documented originless placeholder.

## Deploying it

Either paste the file into the dashboard, or from this directory:

```
npx wrangler deploy app-router.js --name amryn-app-router \
  --route 'www.amryn.ai/app*'
```

The route is `www.amryn.ai/app*` and **not** `www.amryn.ai/app/*`. The bare
`/app` with no trailing slash has to reach the Worker too, and the second
pattern misses it — the symptom is a marketing 404 on the one URL everybody
types first.

## Checking it works

Sign in, then sign out. That exercises the `Location` rewrite, which is the
part most likely to be wrong, and the failure is loud: you land on
`amryn-production.up.railway.app` instead of staying on `www.amryn.ai`.

Cloudflare's [Trace](https://developers.cloudflare.com/rules/trace-request/)
tool will say whether the route matched for a given URL.
