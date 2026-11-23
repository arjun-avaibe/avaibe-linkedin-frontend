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

## UI preview without the backend (mock mode)

```powershell
npm run dev:mock       # http://localhost:5173, no backend or database needed
```

Every API call is answered in the browser from sample data (`src/mocks/`), so the whole app can be clicked
through: demo sign-in, Dashboard, Data, Calendar, Create post → approve → publish, Leads, Pipeline,
Suggestions and AI ideas (canned answers), LinkedIn connect, Settings and Team.

- Changes (new drafts, leads, settings…) are kept in this browser's localStorage and survive a reload.
  **Reset sample data** in the yellow banner starts over.
- Nothing is sent anywhere; the AI and LinkedIn screens return made-up answers. File imports are not read.
- `npm run build:mock` builds the same preview for hosting (e.g. a Vercel preview with no backend).
  Normal builds (`npm run build`) never load the mock code.
- When an endpoint changes in the backend, update its type in `src/lib/api.ts` and its handler in
  `src/mocks/index.ts`; the type checker points at mismatches.

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
