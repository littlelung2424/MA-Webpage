# Repository structure

The site combines Next.js routes with standalone HTML tools. Keep this split: the tools remain portable, while the website owns URLs, hosting, public assets, and intake services.

## Folder responsibilities

| Path | Purpose |
| --- | --- |
| `app/` | Thin Next.js pages, route handlers, API entry points, layout, and global styles. |
| `components/` | Shared React UI such as `BrandHomeLink.tsx`. |
| `features/intake/` | Intake form, validation, upload metadata, and submission integration. |
| `features/intake-admin/` | Admin UI, server actions, data access, and attachment handling. |
| `features/intake-notifications/` | Notification worker implementation. |
| `lib/` | Shared server helpers for static HTML and intake database access. |
| `static-pages/` | Homepage and standalone workspace HTML documents. |
| `public/assets/brand/` | Shared logos and homepage-link CSS. |
| `public/assets/mascots/` | Mascot assets. |
| `public/icons/` | Favicons and app icons. |
| `public/` | Sitemap, robots rules, and web manifest. |
| `supabase/migrations/` | Ordered database schema history; retain applied migrations. |
| `tests/` | Notification worker and isolated PostgreSQL outbox tests. |
| `.github/workflows/` | Intake notification scheduler. |
| `docs/` | Maintenance guidance and audit records. |

## Routing map

| URL | Source |
| --- | --- |
| `/` | `app/route.ts` → `static-pages/index.html` |
| `/workspace` | `app/workspace/route.ts` → `static-pages/workspace/index.html` |
| `/workspace/order-verification` | Matching route → `static-pages/workspace/order-verification/index.html` |
| `/workspace/four-c-qa-scorer` | Matching route → `static-pages/workspace/four-c-qa-scorer/index.html` |
| `/intake` | `app/intake/page.tsx` |
| `/admin/intake` | `app/admin/intake/page.tsx` |
| `/api/intake` | Intake submission handler |
| `/api/admin/intake/debug` | Protected diagnostic handler |
| `/api/admin/intake/files/download` | Protected attachment download handler |
| `/api/internal/intake-notifications` | Authenticated notification worker entry point |
| `/index.html` | Catch-all compatibility alias for the homepage |
| Legacy root image/icon filenames | Catch-all redirects to public asset URLs |

`/workspace` and its listed child routes are the supported application URLs. No alternate application route aliases are maintained.

## Maintenance rules

1. Keep feature logic in `features/`, reusable helpers in `lib/`, and route entry points small.
2. For each standalone page, add its HTML under `static-pages/`, an explicit `app/.../route.ts`, and the corresponding `outputFileTracingIncludes` entry in `next.config.ts`.
3. Keep browser assets under `public/` and reference them with absolute URLs such as `/assets/brand/02.png`.
4. Follow [the branding standard](brand-header-standard.md) for logo links and [tool hosting](tool-hosting.md) when syncing applications.
5. Update route documentation and the sitemap when public navigation changes. Preserve useful compatibility redirects.
6. Keep generated output, local secrets, and test databases out of Git. `.env.example` is the committed template.
7. Do not delete applied migrations or compatibility assets solely because they are not referenced by the current page markup.
