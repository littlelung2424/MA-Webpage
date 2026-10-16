# Repository audit — 2026-10-15

Baseline: `1da21d9e58343b32e50ec5367a33f5b6272aafb5`.

## Assessment

The existing organization is appropriate. No broad move, framework rewrite, or deletion is warranted. The audit inventoried all 86 tracked files and scanned the 70 text/config/source files for structural references. Binary assets were inventoried, not visually revalidated.

## Verified from source

- All four static HTML documents have explicit route handlers and matching deployment tracing entries.
- Relative application imports resolve to tracked files. The reference to `.next/types/routes.d.ts` is generated build output, not a missing source file.
- The scanned literal local HTML/React/CSS asset and page references resolve; embedded and external resources were excluded.
- Declared root dependencies match the lockfile. Framework configuration, TypeScript configuration, lockfile, and environment template exist.
- All seven database migrations remain present; feature code and notification tests have their referenced files.
- No generated dependency/build directories or real environment files are tracked at this revision. This is not a full secret-history scan.
- The admin proxy covers `/admin` and `/api/admin`. The internal notification worker uses its separate bearer-secret gate.
- Duplicate 180px icon contents are intentional aliases for the manifest/apple icon references; retain both filenames.
- The two shared asset files not found in the markup reference scan are still targets of compatibility redirects; retain them.

## Corrections made

- Updated README and maintenance documentation from retired `/tools` locations to `/workspace`.
- Documented `features/`, `components/`, tests, scheduler, current routes, and local verification commands.
- Corrected the scheduler description: the actual workflow is hourly, not every five minutes. Scheduling behavior was not changed.
- Corrected Four C's upstream revision and recorded its website-specific homepage link.
- Expanded `.gitignore` to cover plain `.env` and environment variants while retaining `.env.example`, plus browser-test output.

## Recommended follow-ups

1. **Restore old URL redirects if those URLs were shared.** The catch-all currently returns 404 for `/tools`, `/tools/index.html`, `/tools/order-verification`, and `/tools/four-c-qa-scorer`. Map them to the corresponding `/workspace` routes. The current site navigation uses valid workspace URLs.
2. **Add pull-request verification.** The sole workflow invokes notifications; there is no repository workflow running the build, TypeScript check, and tests. Existing tests focus on notifications/outbox, leaving routes, assets, intake validation, and tool behavior without equivalent regression coverage.
3. **Keep tool synchronization explicit.** Portable source lives in `Applications`; website copies live here. Compare versions and preserve hosting adaptations. A shared update/check script would reduce drift.
4. **Review dependency ranges deliberately.** Several dependencies use `latest`. The committed lockfile provides exact resolutions, but regenerating it can introduce major upgrades. Pin or bound versions during a separately tested dependency-maintenance change.
5. **Consider adding the two workspace tool URLs to the sitemap** if they should be indexed. They are navigable but absent from the current sitemap.
6. **Review intake failure cleanup separately.** Uploads occur before the database transaction; a subsequent failure can leave orphaned private Blob objects. Existing notification documentation acknowledges this behavior.
7. **Refresh preview screenshots** after design changes. The stored previews predate the current compact Four C's masthead.

## Verification limits

This was a repository structure and source-reference audit, not a claim that every production integration works. No clone was made and no local build or test suite was run. No database migrations, secrets, notification settings, uploads, or live data were changed. Live database state, email delivery, external AI services, browser behavior, and dependency vulnerability status need separate verification. The baseline commit's Vercel production deployment had previously reached READY; that does not replace integration testing.
