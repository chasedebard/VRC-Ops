# Deployment

How vrc-ops.org is built and deployed from this repository via GitHub Pages, and the
GitHub Desktop workflow for day-to-day changes.

## How it's wired up

- **Hosting:** GitHub Pages, deployed via the `.github/workflows/deploy.yml` Actions workflow
  (build → `actions/upload-pages-artifact` → `actions/deploy-pages`) on every push to `main`.
  This requires the repository's **Settings → Pages → Source** to be set to **GitHub Actions**
  (done once; see below).
- **Custom domain:** `vrc-ops.org`, via `public/CNAME` (copied into the build output by Vite).
  Because this is a root/apex custom domain (not a `github.io/<repo>` path), `vite.config.ts`
  keeps `base: '/'` — do not change this to a repo-name subpath.
- **SPA routing on GitHub Pages:** GitHub Pages has no server-side rewrites, so a hard refresh
  on a deep route like `/drivers/123` would 404 without help. `public/404.html` is a copy of
  `index.html` that lets the app's router take over after GitHub Pages serves it as the 404
  fallback (the standard `spa-github-pages` pattern).
- **Environment:** only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (both public-safe, see
  `docs/WEB_LIMITATIONS.md`) are baked into the build via the workflow's `env:` block, sourced
  from repository **Settings → Secrets and variables → Actions**. Nothing else is required at
  build time.

## One-time GitHub Pages setup

1. Push this repository to `main` on `github.com/chasedebard/VRC-Ops` (public repo — already
   the case).
2. In **Settings → Pages**, set **Source** to **GitHub Actions**. (If you'd rather not use the
   `gh api` shortcut below, this single dropdown is the only manual step.)
3. Add two **Actions secrets** (Settings → Secrets and variables → Actions → New repository
   secret): `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (the same values as your local
   `.env` — the anon key, never the service-role key).
4. In **Settings → Pages → Custom domain**, enter `vrc-ops.org` and enable **Enforce HTTPS**
   once the certificate provisions (can take up to ~24h after DNS propagates).

## DNS records to add at your domain registrar

For an apex/root domain pointed at GitHub Pages, add these four **A records** for `vrc-ops.org`
(all four, not just one — GitHub Pages load-balances across them):

```
185.199.108.153
185.199.109.153
185.199.110.153
185.199.111.153
```

Optionally, if you also want `www.vrc-ops.org` to work, add a **CNAME record** for `www`
pointing to `chasedebard.github.io`.

DNS propagation can take anywhere from minutes to ~48 hours. You can verify with:

```bash
dig +short vrc-ops.org
```

## GitHub Desktop workflow

1. Pull the latest `main` in GitHub Desktop.
2. Create a branch for your change (`Branch → New Branch`).
3. Make edits, then use GitHub Desktop's diff view to review and commit in logical groups
   (matches the phase-grouped commit history this project was built with).
4. Push the branch, open a PR on github.com (or push directly to `main` for small doc fixes).
5. Merging to `main` triggers the deploy workflow automatically — check the **Actions** tab for
   the run, then confirm the live site at https://vrc-ops.org.

## Local development

```bash
npm install
cp .env.example .env   # fill in your Supabase URL + anon key
npm run dev
```

## Pre-deploy validation

```bash
npm run typecheck
npm run lint
npm run build
npm run preview
```

All four must succeed before merging to `main`.
