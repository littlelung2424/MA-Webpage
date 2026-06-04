# Mission Atlas xD Website

Static website for Mission Atlas xD. The production domain is `missionatlasxd.com`.

## Site structure

This repository is a Next.js site that serves the static marketing pages and the `/intake` form/API.

| URL | Source file | Notes |
| --- | --- | --- |
| `/` | `index.html` via `app/route.ts` | Homepage |
| `/apps/` | `apps/index.html` via `app/[...path]/route.ts` | Apps landing page |
| `/intake` | `app/intake/page.tsx` | Intake form |
| `/api/intake` | `app/api/intake/route.ts` | Intake form submission endpoint |
| `/sitemap.xml` | `sitemap.xml` | XML sitemap |
| `/robots.txt` | `robots.txt` | Search crawler rules |

Images and icons are committed at the repository root and referenced with relative paths so they work from both the root page and `/apps/`.

## Vercel deployment settings

Use these exact settings when importing the GitHub repository into Vercel:

- **Framework Preset:** Next.js
- **Root Directory:** `./`
- **Build Command:** `npm run build`
- **Output Directory:** leave empty / Vercel default
- **Install Command:** `npm install`
- **Development Command:** `npm run dev`
- **Node.js Version:** Vercel default is fine
- **Environment Variables:** configure the intake variables below

The `vercel.json` file configures the Next.js build and sets explicit content types for `robots.txt`, `sitemap.xml`, and `site.webmanifest`.

### Intake form environment variables

The `/api/intake` route sends notification emails through Resend. If Vercel logs show `Intake notification email environment variables are not configured`, the deployment is missing one or both required email variables.

Add these in **Vercel Project Settings > Environment Variables** for the environment you are testing, then redeploy the project:

| Variable | Required | Purpose |
| --- | --- | --- |
| `RESEND_API_KEY` | Yes | API key from Resend, used to send the notification email. |
| `INTAKE_NOTIFY_EMAIL` | Yes | Recipient email address for new intake submissions. |
| `INTAKE_FROM_EMAIL` | No | Sender address for the intake email. For production, use a sender on a domain verified in Resend. Defaults to `Mission Atlas Intake <onboarding@resend.dev>` if omitted. |
| `BLOB_READ_WRITE_TOKEN` | No | Enables Vercel Blob uploads so submitted files are linked in the email. If omitted, files are attached directly to the email up to the app's attachment size limit. |

Use `.env.example` as the template for local development. Do not commit real API keys or tokens.

After deployment, verify these URLs:

- `https://missionatlasxd.com/`
- `https://missionatlasxd.com/apps/`
- `https://missionatlasxd.com/sitemap.xml`
- `https://missionatlasxd.com/robots.txt`

## DNS records for `missionatlasxd.com`

At the DNS host for `missionatlasxd.com`, point the apex domain to Vercel:

| Type | Name / Host | Value | Notes |
| --- | --- | --- | --- |
| `A` | `@` | `76.76.21.21` | Vercel apex domain record |
| `CNAME` | `www` | `cname.vercel-dns-0.com` | Optional, only if you also add `www.missionatlasxd.com` in Vercel |

Remove or replace any old GitHub Pages records when switching to Vercel, especially:

- `A` records pointing to `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, or `185.199.111.153`
- `AAAA` records pointing to GitHub Pages IPv6 addresses
- `CNAME` records for `www` pointing to a GitHub Pages host

Keep `missionatlasxd.com` added as a Production Domain in the Vercel project so Vercel provisions HTTPS automatically. Vercel may recommend project-specific records in the dashboard or with `vercel domains inspect missionatlasxd.com`; if it does, use Vercel's project-specific recommendation.

## Rollback plan to GitHub Pages

If you need to return to GitHub Pages:

1. In GitHub, enable Pages for this repository using the branch and folder that previously served the site.
2. Keep the `CNAME` file in the repository with `missionatlasxd.com`.
3. At the DNS host, remove the Vercel apex `A` record (`76.76.21.21`).
4. Restore GitHub Pages apex `A` records:
   - `185.199.108.153`
   - `185.199.109.153`
   - `185.199.110.153`
   - `185.199.111.153`
5. If using `www`, point it back to the GitHub Pages hostname required by your GitHub Pages configuration.
6. Wait for DNS propagation, then verify `https://missionatlasxd.com/`, `https://missionatlasxd.com/apps/`, `https://missionatlasxd.com/sitemap.xml`, and `https://missionatlasxd.com/robots.txt`.
