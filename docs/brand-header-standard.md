# Mission Atlas xD header branding standard

Every page with a Mission Atlas xD logo in its header should make the entire logo/wordmark a keyboard-accessible link to `/`.

- Standalone HTML: wrap existing branding in `<a href="/" class="ma-brand-home-link" aria-label="Mission Atlas xD home">…</a>` and load `/assets/brand/home-link.css`.
- Next.js React pages: use `components/BrandHomeLink.tsx` around the existing logo/wordmark; the equivalent styling lives in `app/globals.css`.
- Preserve each page's own header layout, logo sizing, and navigation.
- Do not make decorative or unrelated images clickable by default.
- When adding new pages, apply this convention from the outset and test keyboard focus and the return-home action.

The 4C's QA Scorer is intentionally deferred pending its separate redesign. The standalone apps remain independent HTML and do not automatically inherit React components.
