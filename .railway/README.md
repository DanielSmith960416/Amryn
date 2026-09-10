# Railway configuration

`railway.ts` describes both Railway services — the web app and the job worker —
as one file. It replaced `railway.json`, which Railway stops reading on
2026-12-01.

## Nothing here runs at deploy time

Railway does not read this directory during a build or a deploy. It is
evaluated only by the Railway CLI, on `plan` and `apply`. Committing a change
here changes nothing on its own.

That is worth knowing in both directions: a service's build settings must also
be set on the service itself, because this file is not what a deploy consults.
Both services name `Dockerfile` in their own settings for that reason.

## Omit means delete

A resource or variable that is not named in `railway.ts` is one the next
`apply` removes. This is the property to hold in mind before editing.

Every variable on both services is listed as `preserve()` — "keep the value
Railway already has" — so no secret is written into this repository and none is
dropped. Generated `*.up.railway.app` domains are deliberately absent; Railway
does not manage those through this file.

## Changing it

Open a pull request. `.github/workflows/railway-config.yml` plans on any pull
request touching this directory and comments the diff, and applies it when the
pull request merges — so **merging is the approval**. Read the plan before
merging, and do not merge one showing a service delete, a variable delete, or a
change to something you did not touch.

By hand instead, from a machine with the CLI:

```
railway login
railway link          # this project, the production environment
railway config plan   # read this carefully
railway config apply
```

`railway config pull --force` rewrites this file from live state, which is how
to settle any disagreement between the two: the live environment wins.

The full cutover, including where the project token comes from, is in
`docs-internal/DEPLOYMENT.md`.
