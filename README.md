# xpost

Write once, post everywhere. xpost is a crossposter for TikTok, Instagram, YouTube, X, Facebook and Snapchat. It uses no social media APIs: manual intent links, handoff, and desktop assisted fill only. Plan: [docs/step0/PLAN.md](docs/step0/PLAN.md).

## Layout

- `web/` React 19 + Vite + Tailwind 4 app
- `worker/` Cloudflare Worker: `/api/*` and security headers; serves `web/dist` via the ASSETS binding
- `shared/` types and constants shared by web and worker
- `desktop/` placeholder (milestone M7)
- `wrangler.toml` at the repo root

## Commands

- `npm install`
- `npm run typecheck`
- `npm test`
- `npm run build` builds the web app, then typechecks the Worker
- `npm run dev` builds the web app and runs `wrangler dev` (http://localhost:8787); for hot reload run `npm run dev -w web` alongside it

## Deploy

Cloudflare Git integration (Workers Builds) on the Worker named `xpost`. Production branch `claude/great-lamport-krx9rg`; every push deploys. Dashboard build settings:

- Root directory: `/` (blank)
- Build command: `npm run build`
- Deploy command: `npx wrangler deploy`

CI (`.github/workflows/ci.yml`) only typechecks, tests and builds. Secrets go in the Cloudflare dashboard or a local `.dev.vars` (ignored), never in the repo.
