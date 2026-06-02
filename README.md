# Mission Atlas xD Website

Static website for Mission Atlas xD. The production domain is `missionatlasxd.com`.

## Site structure

This repository is a plain static HTML site. Do not convert it to React, Next.js, or another framework unless the site requirements materially change.

| URL | Source file | Notes |
| --- | --- | --- |
| `/` | `index.html` | Homepage |
| `/apps/` | `apps/index.html` | Apps landing page |
| `/sitemap.xml` | `sitemap.xml` | XML sitemap |
| `/robots.txt` | `robots.txt` | Search crawler rules |

Images and icons are committed at the repository root and referenced with relative paths so they work from both the root page and `/apps/`.

## Vercel deployment settings

Use these exact settings when importing the GitHub repository into Vercel:

- **Framework Preset:** Other
- **Root Directory:** `./`
- **Build Command:** leave empty / None
- **Output Directory:** `./`
- **Install Command:** leave empty / None
- **Development Command:** leave empty / None
- **Node.js Version:** Vercel default is fine because there is no build step
- **Environment Variables:** none required

The `vercel.json` file keeps static trailing-slash routes stable and sets explicit content types for `robots.txt` and `sitemap.xml`.

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
