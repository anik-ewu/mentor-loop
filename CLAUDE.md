# MentorLoop

A job-search toolkit with human mentoring built in: job tracker, AI coach (Claude), weekly goals, mentor bookings. The README covers setup, deployment and env vars; `docs/SPEC.md` holds feature requirements. This file covers how to work in the repo.

## Git workflow (always follow)

- **Work on `dev`.** Every change is committed to `dev`, never straight to `main`. If the session starts on another branch, switch to `dev` first (or branch off `dev` and merge back into it).
- **Review before pushing to `dev`.** Before every `git push` to `dev`, run the `code-reviewer` agent on the unpushed changes (`git diff origin/dev...HEAD`, plus any uncommitted work). Fix real problems, tell the user what the review found, then push.
- **Run the checks before pushing:** `npm run format:check && npm run lint && npm run typecheck`. Also run `npm test` when the API changed (it needs the `mentorloop_test` database).
- **Ask before merging to `main`.** When a piece of work is finished and pushed to `dev`, ask the user whether to merge `dev` into `main`. Do it only after a clear yes, by opening a PR `dev` → `main`, never with a direct push. Pushing to `main` redeploys production (Render and Vercel).
- **PR titles for `dev` → `main`** start with the type of the main change, then that change as a short title:
  - `feat: Add forgot password for email and Google accounts` for a new feature or capability.
  - `fix: Log out other sessions after a password reset` for a bug or security fix.
  - When a PR holds several changes, title it after the biggest one and list the rest in the description.
  - Merge with a merge commit, not a squash, so `dev` and `main` stay in step. Then fast-forward `dev` to `main`.
- Commit messages: a short imperative subject that says what changed for the user, like the existing history ("Add weekly goals and streaks, …", "Don't count failed AI runs toward the daily limit").

## Commands

| Task                        | Command                                                                    |
| --------------------------- | -------------------------------------------------------------------------- |
| Dev (API :4000 + web :5173) | `npm run dev`                                                              |
| Lint / format / types       | `npm run lint` · `npm run format` · `npm run typecheck`                    |
| API tests                   | `npm test` (Vitest + Supertest against a real Postgres, `mentorloop_test`) |
| Single test file            | `npm test -w @mentor-loop/api -- tests/jobs.test.ts`                       |
| Prisma                      | `npm run db:generate` · `npm run db:migrate` · `npm run db:seed`           |
| Reset demo data             | `npm run db:reset-demo`                                                    |

CI (`.github/workflows/ci.yml`) runs format:check, lint, typecheck, test and build on pushes to `main` and `dev` and on PRs.

## Layout

```
apps/api/  Express 5 + Prisma. src/modules/<feature>/{<feature>.routes,.schema,.service}.ts
           src/lib (errors, prisma, jwt, timezone), src/middleware (auth, validate, errorHandler)
           src/config/env.ts validates env with zod; prisma/ has schema, migrations, seed, demo data
           tests/ one file per module, helpers.ts (resetDb, loginAs, createService, createSlot)
apps/web/  React 19 + Vite + TanStack Query + React Router, CSS Modules
           src/api/<feature>.ts typed calls via api() in client.ts; types in api/types.ts
           src/pages/{user,admin}/…, shared UI in src/components, design tokens in src/styles/tokens.css
```

## Conventions

**API**

- A feature is a module: `*.schema.ts` (zod) → `*.routes.ts` (thin: auth, validate, call the service, `res.json`) → `*.service.ts` (Prisma and business logic). Mount new routers in `src/app.ts`.
- Validate bodies with `validateBody(schema)`. Parse queries with `schema.parse(req.query)`.
- Throw errors from `src/lib/errors.ts` (`badRequest`, `notFound`, `conflict`, …). The error handler turns them into `{ error: { code, message, fields? } }`. Never send ad-hoc error JSON.
- Get the user with `currentUserId(req)` behind `requireAuth`. Always scope queries by `userId` so one user can't read another's data.
- Race-sensitive writes, like booking a slot, use conditional updates inside a transaction (`WHERE status='open'`), not read-then-write.
- Derive numbers (goals, streaks) from the data rather than storing counters.
- AI features all go through `AiRun` (one quota, a background runner, polling). Treat resumes and job posts as untrusted data in prompts. Check model output against a schema.
- Schema change: edit `prisma/schema.prisma`, run `npm run db:migrate` (creates the migration), and update `seed.ts`, `demo.ts` and the `TRUNCATE` list in `tests/helpers.ts` if a table is added.

**Web**

- Server state goes through TanStack Query hooks that call the `src/api/*` functions. Don't call `fetch` directly.
- Style with CSS Modules and the tokens in `tokens.css`. Support light and dark themes, and mobile (tab bar) as well as desktop (sidebar).
- Map `ApiError.fields` to inline form messages.

**Both**

- TypeScript strict, Prettier (single quotes, 100 cols, trailing commas). Prefix unused args with `_`.
- Short doc comments that explain _why_, matching the existing code. Name things for what they mean to the user.

## Automation in `.claude/`

- `hooks/format-and-lint.sh` runs after every Edit/Write: Prettier formats the file and ESLint `--fix` runs on it. Lint errors that can't be fixed automatically are reported back so they get fixed right away.
- `hooks/guard-main.sh` asks the user before any `git push` that targets `main`.
- `agents/code-reviewer.md` reviews a diff for bugs, security and convention problems, and explains each finding so the user learns from it. Use it before pushing to `dev`. The built-in `/code-review` and `/simplify` are good extras for bigger changes.

## Knowledge base (keep this file growing)

When a session turns up something non-obvious about this repo, add it below in a line or two and commit it with the change: a gotcha, a decision and its reason, a command that works, a mistake to avoid. Update or remove entries that become wrong. Don't repeat what the README or the code already says.

- An `ANTHROPIC_API_KEY` exported in the shell overrides `apps/api/.env`. When AI calls fail with "isn't set up correctly", check the shell env first.
- API tests share one database and run serially (`fileParallelism: false`). Every test file that touches the database calls `resetDb()`.
- The Render free tier sleeps after 15 minutes idle, so the first request in production can take 30–60 s. That's not a bug.
- After merging a branch that adds a Prisma migration, run `npm run db:migrate` locally. Tests apply migrations to `mentorloop_test` on their own, but the dev database doesn't, and the API then answers 500 ("column does not exist"). Production runs `prisma migrate deploy` on container start.
- Password reset emails go through Resend. Without `RESEND_API_KEY`, dev prints the link to the API log, while production hides "Forgot password?" (`passwordResetEnabled` in `/auth/config`) and never logs the link.
