# Hosted applications

The launcher links directly to two Next.js route handlers that serve the existing standalone HTML applications:

| Route | Upstream source in `littlelung2424/Applications` | Source blob SHA |
| --- | --- | --- |
| `/workspace/order-verification` | `PO Tools/Branded/poallinone_v16.9_mission-atlas.html` | `0d09359f2264bda2216c8e4e5e821eede5b684ab` |
| `/workspace/four-c-qa-scorer` | `Four C's/4c_qa_scorer_v2.html` | `adf64577c07d8daf34e24ba5980e5944db9328bc` |

Files live in the corresponding `static-pages/workspace/<slug>/index.html` directories. They are maintained copies of the upstream source. Website-specific homepage links may differ: Four C's includes a keyboard-accessible logo link to `https://www.missionatlasxd.com`. Preserve these adaptations when syncing an upstream update. `next.config.ts` explicitly includes each file in its route's deployment bundle. No iframe, application rewrite, additional authentication, or new dependency is required.

## AI configuration

Hosting serves the interfaces; it does not provision an AI backend. In an ordinary browser, use each application's existing Settings screen to select its standalone environment and configure a compatible scoring/extraction proxy. The scorer's default embedded-AI environment is not a configured web-hosted provider. Do not embed provider credentials in these public HTML files. Actual AI requests were not exercised during hosting verification.

The existing application behavior, field extraction, scoring, exports, provider integrations and storage keys remain unchanged. History/settings are browser-local and tied to the site origin. Data from downloaded files or a different domain does not automatically move here; export needed records before switching origins.

The source blob SHAs above identify the upstream versions imported, not the current website file hashes. Changing `Applications` does not automatically update this repository.

## Updating a tool

Compare its HTML with the reviewed upstream version, preserve website-specific links, retain the route and tracing entry, then run build, TypeScript and the existing tests. Check the launcher link, settings screen, console errors and desktop/mobile layouts against a production-mode local server. Confirm the HTML appears in `.next/server/app/workspace/<slug>/route.js.nft.json` before deployment.

Production publication still requires owner approval. After approval and deployment, the URLs are `https://missionatlasxd.com/workspace/order-verification` and `https://missionatlasxd.com/workspace/four-c-qa-scorer`.
