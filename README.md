# AVAIBE LinkedIn app: frontend

The screens of the AVAIBE LinkedIn marketing app (React, Vite, Tailwind, shadcn/ui).
The API is the separate **avaibe-linkedin-backend** repository (Django).

## Run locally

```powershell
npm install
npm run dev            # http://localhost:5173, forwards /api to http://127.0.0.1:8000
```

To point at another backend (for example the Test2 copy on port 8002):

```powershell
$env:API_TARGET = 'http://127.0.0.1:8002'; $env:VITE_COPY_LABEL = 'Test2'
npm run dev -- --port 5175 --strictPort
```

## Host on Vercel

1. vercel.com → **Add New → Project** → choose this repository (framework: Vite, detected; no root directory needed).
2. Environment variable `VITE_DEMO_BANNER` = `1` shows "Demo data" across the top.
3. `vercel.json` forwards `/api/...` to the backend on Render. If the Render service has another address,
   change it there, commit and push.

The screens need the backend to show anything: every page loads its data from `/api`.
Hosting steps for the backend and database are in the backend repository's `DEPLOY.md`.

## Checks

```powershell
npx tsc -b             # type check
npm run build          # production build into dist/
```
