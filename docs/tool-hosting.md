# Hosted applications

The launcher links directly to two Next.js route handlers that serve the existing standalone HTML applications:

| Route | Upstream source in `littlelung2424/Applications` | Source blob SHA |
| --- | --- | --- |
| `/tools/order-verification` | `PO Tools/Branded/poallinone_v16.9_mission-atlas.html` | `0d09359f2264bda2216c8e4e5e821eede5b684ab` |
| `/tools/four-c-qa-scorer` | `Four C's/4c_qa_scorer_v2.html` | `b5711a9123f5afb1c74e5b6cb065b7677ea1f018` |

Files live in the corresponding `static-pages/tools/<slug>/index.html` directories. They are copied unchanged from the upstream source. `next.config.ts` explicitly includes each file in its route's deployment bundle. No iframe, application rewrite, additional authentication, or new dependency is required.

## AI configuration

Hosting serves the interfaces; it does not provision an AI backend. In an ordinary browser, use each application's existing Settings screen to select its standalone environment and configure a compatible scoring/extraction proxy. The scorer's default embedded-AI environment is not a configured web-hosted provider. Do not embed provider credentials in these public HTML files. Actual AI requests were not exercised during hosting verification.

The existing application behavior, field extraction, scoring, exports, provider integrations and storage keys remain unchanged. History/settings are browser-local and tied to the site origin. Data from downloaded files or a different domain does not automatically move here; export needed records before switching origins.

## Updating a tool

Replace its HTML with the reviewed upstream version, retain the route and tracing entry, then run build, TypeScript and the existing tests. Check the launcher link, settings screen, console errors and desktop/mobile layouts against a production-mode local server. Confirm the HTML appears in `.next/server/app/tools/<slug>/route.js.nft.json` before deployment.

Production publication still requires owner approval. After approval and deployment, the URLs are `https://missionatlasxd.com/tools/order-verification` and `https://missionatlasxd.com/tools/four-c-qa-scorer`.
