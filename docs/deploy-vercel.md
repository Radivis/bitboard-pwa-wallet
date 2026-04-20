# Vercel production deploy (GitHub Actions, prebuilt)

Production builds run **only in GitHub Actions**; Vercel hosts the static output. Complete this **once** before the deploy workflow can succeed.

## 1. Create the Vercel project

1. Sign in at [vercel.com](https://vercel.com) and **Import** this Git repository.
2. Set **Root Directory** to `frontend`.
3. **Framework Preset:** Vite.
4. **Build & Output Settings:**
   - **Install Command:** `npm ci`
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
5. **Node.js Version:** 24 (match `frontend/package.json` `engines`).

## 2. Environment variables

In the project **Settings → Environment Variables**, add **Production** values for anything required at build time. At minimum configure **`VITE_API_BASE_URL`** to your production API base URL (see `frontend/src/vite-env.d.ts`).

## 3. Avoid broken duplicate builds on Vercel

The real wallet build needs **Rust + wasm-pack** on the runner; Vercel’s default Git-triggered build cannot reproduce that alone. Either:

- **Disable automatic production deployments** from Git (use only the GitHub Action), or  
- Set an **Ignored Build Step** that always skips (e.g. `exit 0`) so pushes do not trigger a failing Vercel-side build.

## 4. Deploy token and IDs for GitHub Actions

1. Create a **Vercel token**: Account **Settings → Tokens** (scope: deploy access to this project / team).
2. Copy **Team ID** (or personal scope) and **Project ID** from the project **Settings → General**.

Add these **repository secrets** in GitHub (**Settings → Secrets and variables → Actions**):

| Secret               | Value                                      |
|----------------------|--------------------------------------------|
| `VERCEL_TOKEN`       | Token from step 1                          |
| `VERCEL_ORG_ID`      | Team / org ID (Vercel shows this as scope) |
| `VERCEL_PROJECT_ID`  | Project ID                                 |

After secrets are set, pushes to `main` run `.github/workflows/deploy-vercel.yml` and publish production via `vercel build` + `vercel deploy --prebuilt`.

The workflow installs **Rust** (with `wasm32-unknown-unknown`), **wasm-pack**, and **Node 24**, then runs **`vercel pull`**, **`vercel build --prod`**, and **`vercel deploy --prebuilt --prod`** from `frontend/`. The **`vercel build`** step executes your project’s **Install** and **Build** commands from the Vercel dashboard (e.g. `npm ci` and `npm run build`), so the full `build:wasm` + `tsc` + `vite build` pipeline runs on the GitHub runner once per deploy.

## 5. Smoke test after first deploy

- Open the production URL and confirm the app loads.
- Navigate to a client route, then **hard refresh**; the SPA fallback in `frontend/vercel.json` should still serve the app.
