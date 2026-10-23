<h1 align="center">MentorLoop</h1>

<p align="center">
  <b>1:1 mentoring and booking SaaS</b>. Clients book resume reviews, career strategy calls and mock interviews; the mentor manages services, availability and bookings from one dashboard.
</p>

<p align="center">
  <a href="https://mentor-loop-five.vercel.app"><b>Live demo</b></a> · React 19 · TypeScript · Express 5 · PostgreSQL · Prisma · Docker
</p>

![Landing page](docs/screenshots/landing-light.png)

## The business

- **Clients** pick a service, choose an open time and send a booking request.
- **The mentor** confirms or declines requests, publishes availability and edits services and prices.
- **Demo mode** lets visitors try both sides with one click ("Try as client" / "Try as mentor").

Highlights: email + password or Google sign-in, a 3-step booking flow with **no double booking**, a responsive dashboard (sidebar on desktop, tab bar on mobile), and light/dark themes.

| Client dashboard                                   | Booking flow                                   |
| -------------------------------------------------- | ---------------------------------------------- |
| ![Client home](docs/screenshots/client-home.png)   | ![Booking](docs/screenshots/booking.png)       |
| **Mentor availability**                            | **Dark mode**                                  |
| ![Availability](docs/screenshots/availability.png) | ![Admin dark](docs/screenshots/admin-dark.png) |

## Tech stack

| Layer    | Tech                                                                      |
| -------- | ------------------------------------------------------------------------- |
| Frontend | React 19, TypeScript, Vite, React Router, TanStack Query, CSS Modules     |
| Backend  | Node.js, Express 5, TypeScript, zod validation, JWT in an httpOnly cookie |
| Database | PostgreSQL, Prisma ORM (migrations + seed)                                |
| Tooling  | npm workspaces, ESLint, Prettier, Vitest + Supertest, GitHub Actions CI   |
| Hosting  | Vercel (web), Render (API, Docker), Neon (Postgres), all on free tiers    |

## Production setup

```
 Browser
    │  https://mentor-loop-five.vercel.app
    ▼
 Vercel ── serves the React build (static files)
    │  /api/*  rewritten (server-side proxy) to Render
    ▼
 Render ── Express API in a Docker container (apps/api/Dockerfile)
    │  DATABASE_URL (SSL)
    ▼
 Neon ──── serverless PostgreSQL
```

**Why the proxy:** the web app calls `/api` on its own origin. Vercel forwards those requests to Render (`apps/web/vercel.json`), so the browser sees one origin: the auth cookie stays first-party (`SameSite=Lax`) and no CORS setup is needed. Locally, the Vite dev proxy and nginx in Docker do the same job.

| Service    | What runs there                   | Config                                                                                       |
| ---------- | --------------------------------- | -------------------------------------------------------------------------------------------- |
| **Neon**   | PostgreSQL (Singapore)            | Use the **direct** connection string (not `-pooler`), with `?sslmode=require`                |
| **Render** | API, free web service (Singapore) | Docker, Dockerfile `./apps/api/Dockerfile`, build context `.`, health check `/api/health`    |
| **Vercel** | Web app                           | Root directory `apps/web`, Vite preset; `vercel.json` proxies `/api/*` and adds SPA fallback |

**Render environment variables**

| Variable                                        | Value                                         |
| ----------------------------------------------- | --------------------------------------------- |
| `DATABASE_URL`                                  | Neon direct connection string                 |
| `JWT_SECRET`                                    | Long random string (`openssl rand -hex 32`)   |
| `CLIENT_ORIGIN`                                 | `https://mentor-loop-five.vercel.app`         |
| `DEMO_MODE`                                     | `true` for the demo, `false` for real clients |
| `SEED_ON_START`                                 | `true` on the first deploy only, then `false` |
| `ADMIN_NAME` / `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Mentor account created by the seed            |
| `GOOGLE_CLIENT_ID`                              | Optional; empty hides the Google button       |

On start, the container runs `prisma migrate deploy`, then the seed if `SEED_ON_START=true`, then the server.

**Deploys:** pushing to `main` redeploys both Render and Vercel automatically.

**Free-tier limits:** the Render API sleeps after 15 minutes idle (first request then takes about 30–60 s). A cron-job.org ping to `/api/health` every 10 minutes keeps it awake.

## Run locally

**Docker (everything in one command):**

```bash
cp .env.example .env        # optional: defaults work for a local demo
docker compose up --build   # http://localhost:8080
```

**Dev mode:** needs Node 20+ and PostgreSQL (or `docker compose up db`).

```bash
npm install
cp apps/api/.env.example apps/api/.env
npm run db:generate && npm run db:migrate && npm run db:seed
npm run dev                 # API on :4000, web on :5173 (proxies /api)
```

Demo accounts (local seed): mentor `admin@mentorloop.dev` / `admin12345`, client `demo@mentorloop.dev` / `demo12345`.

`npm test` (API tests, needs a `mentorloop_test` DB) · `npm run lint` · `npm run typecheck` · `npm run build`

## Code structure

```
apps/api/   Express API: src/modules/{auth,services,slots,bookings} → routes → service → Prisma
            prisma/ (schema, migrations, seed), tests/ (Vitest + Supertest on real Postgres)
apps/web/   React app: src/{api,auth,components,layouts,pages,styles}
```

Key decisions:

- **No double booking:** `UPDATE slot SET status='booked' WHERE id=$1 AND status='open'` in a transaction. Only one request wins; the other gets `409`.
- **One error shape:** `{ error: { code, message, fields? } }`; forms map `fields` to inline messages.
- **Validated env:** `src/config/env.ts` checks env vars with zod and fails fast on boot.

## Google sign-in (optional)

Google Cloud Console → Credentials → **OAuth client ID** (Web). Add the site URL (e.g. `https://mentor-loop-five.vercel.app`) to **Authorized JavaScript origins**, then set `GOOGLE_CLIENT_ID` on Render.

## Roadmap

Learning resources · paid sessions (Stripe) · email notifications and calendar invites · meeting links on confirmed bookings
