# Repository structure

This project is a small Next.js site with a few preserved static pages. The structure is intentionally split by responsibility so files stay easy to find as the site grows.

## Top-level layout

| Path | Purpose |
| --- | --- |
| `app/` | Next.js App Router pages, route handlers, API endpoints, and global styles. |
| `lib/` | Shared server-side TypeScript helpers used by routes/pages. |
| `static-pages/` | Static HTML pages that are served by lightweight Next.js route handlers. |
| `public/` | Static public files served directly by Next.js, including images, icons, sitemap, robots, and manifest files. |
| `supabase/migrations/` | Database migrations for the intake/admin workflow. |
| `docs/` | Project documentation for maintainers. |

## Routing map

| Public URL | Source |
| --- | --- |
| `/` | `app/route.ts` reads `static-pages/index.html`. |
| `/index.html` | `app/[...path]/route.ts` reads `static-pages/index.html` for compatibility. |
| `/tools/` | `app/tools/route.ts` reads `static-pages/tools/index.html`. |
| `/tools/index.html` | `app/[...path]/route.ts` reads `static-pages/tools/index.html` for compatibility. |
| Legacy root asset URLs | `app/[...path]/route.ts` redirects old root asset URLs to their new `public/` locations. |
| `/intake` | `app/intake/page.tsx`. |
| `/admin/intake` | `app/admin/intake/page.tsx`. |
| `/api/intake` | `app/api/intake/route.ts`. |
| `/api/admin/intake/*` | Admin API route handlers under `app/api/admin/intake/`. |

## Static assets

Use `public/` for files that need stable browser URLs:

| Asset type | Folder | URL pattern |
| --- | --- | --- |
| Brand imagery/logos | `public/assets/brand/` | `/assets/brand/...` |
| Mascot imagery | `public/assets/mascots/` | `/assets/mascots/...` |
| Favicons/app icons | `public/icons/` | `/icons/...` |
| SEO/PWA metadata | `public/` | `/robots.txt`, `/sitemap.xml`, `/site.webmanifest` |

When adding a new image, prefer a descriptive file name and place it in the most specific existing folder. Add a new subfolder under `public/assets/` only when the asset category is meaningfully different from brand or mascot imagery.

## Static pages

`static-pages/` contains static HTML that is intentionally not converted to React yet. Keep page-specific inline markup there only while these pages are mostly static. If a page starts sharing significant UI or logic with the app, convert it to an App Router page such as `app/page.tsx` or `app/tools/page.tsx`.

When moving or adding a static page:

1. Put the HTML under `static-pages/`.
2. Prefer an explicit route folder such as `app/tools/route.ts` for live static pages that still need to return full static HTML documents.
3. Use `app/[...path]/route.ts` only for compatibility aliases such as `/index.html`, `/tools/index.html`, and old asset redirects.
4. Add the HTML file to `outputFileTracingIncludes` in `next.config.ts` so Vercel includes it in serverless output tracing.
5. Use absolute public asset URLs such as `/assets/brand/logo.png`; avoid `../` asset paths.
6. If moving a previously public asset URL, add a compatibility redirect in `app/[...path]/route.ts`.
7. Update the README routing table if the public URL changes.
