# MentorLoop revamp: job tracker + AI coach + weekly goals

> Product spec (features, requirements, acceptance criteria): [`SPEC.md`](./SPEC.md).

## Context

MentorLoop is a single-mentor booking app today (services, slots, bookings). Sabbir wants it to become a **job-search toolkit** built around the job tracker, with AI features tied to the jobs a candidate saves. Human mentoring stays, linked to the AI output.

In scope:

1. **Job application tracker**, built the way real job seekers track applications.
2. **AI job match / resume review**: "Check my resume against this job", plus an optional general review.
3. **AI mock-interview question generator** per job.
4. **AI cover-letter draft** from a resume review plus a job.
5. **Weekly goals and streaks** (for example "apply to 5 jobs, schedule 2 interviews").
6. **Booking merge**: book a human Resume Deep-Dive or Career Guidance session with an AI review attached.

**Backlog (not built now):** the Learn area (career tracks for Software, AI and QA engineers with Fresher/Intermediate/Advanced steps and progress), the admin-curated YouTube video library, and mock-interview questions per track. The design from the earlier draft stays valid for later.

Decisions already made:

- AI runs inside the Node API (Anthropic TS SDK).
- Default model is **`claude-haiku-5-5`**, configurable with `ANTHROPIC_MODEL`.
- Resume input is a PDF upload or pasted text.
- We store review output, not the PDF.

Existing patterns to reuse:

- Module layout `apps/api/src/modules/<x>/{x.routes,x.service,x.schema}.ts`, registered in `apps/api/src/app.ts`.
- `requireAuth`, `requireAdmin`, `currentUserId` (`middleware/auth.ts`), `validateBody` (`middleware/validate.ts`), and the error helpers in `lib/errors.ts`.
- Owner checks follow `bookings.cancel` in `modules/bookings/bookings.service.ts`.
- Env in `apps/api/src/config/env.ts`. Optional keys follow the `GOOGLE_CLIENT_ID` pattern: an empty value turns the feature off.
- Web: `api()` (`api/client.ts`), TanStack Query, `EmptyState`/`Skeleton`/`StatusBadge` (`components/ui.tsx`), `Modal`, `ConfirmModal`, `Toast`, `Button`, `CountUp`, CSS Modules plus `styles/tokens.css`, nav arrays in `layouts/AppLayout.tsx`.
- Tests: `apps/api/tests/helpers.ts` (`loginAs`, `resetDb`) with supertest.

## Data model (one migration, `apps/api/prisma/schema.prisma`)

**Job tracker**

- `enum JobStatus { wishlist, applied, assessment, interviewing, offer, accepted, rejected, withdrawn, ghosted }`
- `enum WorkMode { onsite, hybrid, remote }`
- `JobApplication { id, userId, company, title, jobUrl?, location?, workMode?, salaryMin?, salaryMax?, currency?, source?, status, priority (1–3), appliedAt?, followUpAt?, deadline?, contactName?, contactEmail?, jobDescription?, notes?, coverLetter? (the user's edited final version), position Float (Kanban order), createdAt, updatedAt }` with index `[userId, status]`.
- `enum JobEventType { status_change, interview, note, follow_up }`
- `JobEvent { id, jobId, type, fromStatus?, toStatus?, title?, scheduledAt?, outcome?, notes?, createdAt }`. This one table gives the timeline, interview rounds, goal progress and stats.

**AI**

- `enum AiKind { resume_review, interview_questions, cover_letter }`
- `enum AiStatus { processing, done, failed }`
- `AiRun { id, userId, kind, status, jobId? (FK, SetNull), sourceRunId? (the review a cover letter or question set was built from), input Json (fileName, targetRole, tone…; pasted resume text only for text input), result Json?, score Int? (for reviews), error?, model, createdAt, completedAt? }` with index `[userId, kind, createdAt]`.
- One table for every AI feature means one quota counter, one background runner, one polling endpoint and one stale-job cleanup.

**Goals**

- `enum GoalMetric { applications, interviews, follow_ups, resume_matches, interview_preps }`
- `WeeklyGoal { id, userId, weekStart DateTime (Monday 00:00 in the user's timezone, stored UTC), metric, target }` with `@@unique([userId, weekStart, metric])`.
- `User.timezone String @default("UTC")`, set from the browser's `Intl.DateTimeFormat().resolvedOptions().timeZone`.

**Booking merge:** `Booking.resumeReviewId String?` (FK to `AiRun`, `onDelete: SetNull`).

## API

### 1. `modules/jobs`

- `GET /api/jobs?status=&q=&sort=`, `POST`, `GET /:id` (with timeline and linked AI runs), `PATCH /:id`, `DELETE /:id`. Users only ever see their own rows.
- `PATCH /:id/move {status, position}`: in one transaction it writes a `JobEvent(status_change)` and sets `appliedAt` on the first move to `applied`.
- `POST /:id/events` adds an interview round, a note or a "followed up" entry. A follow-up clears or pushes `followUpAt`.
- `GET /api/jobs/stats` returns:
  - counts per status
  - response rate (applied jobs that reached any later stage)
  - interview rate and offers
  - applications this week
  - **follow-ups due**: `followUpAt <= now`, or applied 7+ days ago with no event since

### 2. `modules/ai` (shared runner) + three features

- New deps: `@anthropic-ai/sdk`, `multer` (+ `@types/multer`).
- `ai/claude.ts`: one shared client, `ANTHROPIC_MODEL` (default `claude-haiku-5-5`), `output_config.effort: "medium"` set explicitly.
- `ai.runner.ts` handles the background run for every kind:
  - `startRun(kind, userId, input, fn)` checks the quota, creates a `processing` row, returns it at once, then runs `fn` without awaiting and writes `done` with the result or `failed` with a user-safe error.
  - Async because the Vercel → Render proxy can time out on long calls.
  - On boot, rows still `processing` after 5 min are marked `failed`.
- Shared call helper uses `client.messages.parse({ output_config: { format: zodOutputFormat(schema), effort } })`.
  - Checks `stop_reason` for `refusal` and `max_tokens`.
  - Maps SDK `RateLimitError` and `APIError` to clear messages.
  - Clamps scores to 0–100 after parsing.
  - System prompts treat the resume and job text as **untrusted data** to guard against prompt injection.
  - Haiku 5.5 has no server-side fallback, so a refusal shows as a failed run with a retry option.
- Quota: `AI_DAILY_LIMIT` (default 10) counts all AI runs per user in the last 24 h. Admin is exempt. Over the limit returns 429.
- No `ANTHROPIC_API_KEY` returns 503, and `aiEnabled` on `/api/auth/config` hides the AI buttons in the UI.

**a) Resume review / job match:** `POST /api/ai/reviews` (multipart)

- Input: a PDF (5 MB max, MIME type plus `%PDF` magic-bytes check, sent to Claude as a base64 `document` block) or text (30k chars max). Plus optional `jobId` (uses that job's title and description) or a free-text `targetRole`/`jobDescription`.
- Output schema:
  - `overallScore`, `atsScore`, `summary`, `seniority`
  - `sections[]`, `strengths[]`
  - `improvements[] {priority, issue, fix}`
  - `bulletRewrites[] {original, improved, why}`
  - `missingKeywords[]`, `redFlags[]`
  - `jobMatch {score, matchedSkills, missingSkills, verdict} | null`
  - **`profile`**: a compact structured extract (headline, skills, experience entries with key achievements, projects, education). The cover-letter and interview features reuse it, so the PDF never needs to be stored.

**b) Interview questions:** `POST /api/ai/interview-questions {jobId, reviewId?}`

- Built from the job and, optionally, the candidate's profile from a review.
- Output:
  - `rounds[]`: one per category (technical, system design, behavioral, role-specific, company/culture). Each holds `questions[]` with `question`, `whyAsked`, `answerPoints[]`, `difficulty`, and `fromResume` (true when the question is about the candidate's own project).
  - `questionsToAsk[]`: questions for the candidate to ask the interviewer.

**c) Cover letter:** `POST /api/ai/cover-letters {jobId, reviewId, tone (formal|friendly|concise), length (short|standard)}`

- Output: `{ subject, greeting, paragraphs[], closing, highlightsUsed[] }`. The UI shows it as editable text. "Save to job" writes `JobApplication.coverLetter` with `PATCH /api/jobs/:id`.

**Shared endpoints:** `GET /api/ai/runs?kind=&jobId=`, `GET /api/ai/runs/:id` (polled every 2 s), `DELETE /api/ai/runs/:id`.

### 3. `modules/goals`

- `GET /api/goals/current`: this week's goals with **progress computed from the data**, so no counters can drift:
  - applications = `JobEvent` status changes to `applied` this week
  - interviews = `JobEvent(interview)` this week
  - follow-ups = `JobEvent(follow_up)` this week
  - resume_matches and interview_preps = `done` `AiRun`s this week
  - If the week has no goals yet, last week's targets are copied forward.
- Returns two streaks:
  - **weekly streak**: consecutive past weeks where every goal was met
  - **daily activity streak**: consecutive days with any job event or AI run, in the user's timezone
- `PUT /api/goals/current {goals: [{metric, target}]}` and `GET /api/goals/history?weeks=8`.
- `PATCH /api/auth/me {timezone}` (or set it on login) stores the IANA timezone, validated with `Intl`.

### 4. Booking merge

- `bookings.schema.ts` accepts an optional `resumeReviewId`, which must be the user's own `done` review.
- `withDetails` includes the review's score and summary so the mentor's booking card shows it.
- Seed: rename services to "Resume Deep-Dive", "Career Guidance Call" and "Mock Interview". Add demo jobs, events and a goal set for the demo user (no fake AI output).

## Web (`apps/web/src`)

- `api/client.ts`: support a `FormData` body (no Content-Type header). New `api/jobs.ts`, `api/ai.ts`, `api/goals.ts`, and types in `api/types.ts`. Add a `usePollRun(id)` hook that polls until done or failed.
- **Nav** (user): Home · Jobs · AI Coach · Sessions. Sessions combines Book and My sessions in tabs. Admin nav stays unchanged.
- **Jobs** (`pages/user/jobs/`):
  - **Board**: Kanban by status with native HTML5 drag and drop, and a status `<select>` fallback on touch and mobile.
  - **Table**: search, filter and sort.
  - Stats strip: funnel counts, response rate, follow-ups due.
  - Quick-add form that only needs company, title and link.
  - **Job drawer** with tabs:
    - Details: every field, editable.
    - Timeline: events, plus "Add interview round", "Log follow-up" and "Add note".
    - **AI**: "Check my resume against this job", "Generate interview questions" and "Draft cover letter", plus the saved results for this job.
- **AI Coach** (`pages/user/ai/`):
  - New general review: PDF dropzone or paste, plus optional target role.
  - History tabs for Reviews, Interview prep and Cover letters.
  - Result views:
    - **Review**: score rings, prioritised fixes, before→after bullet rewrites with copy buttons, keyword chips, red flags, and a CTA "Book a Resume Deep-Dive with this review" that links to `/app/sessions?service=…&review=…` (`Book.tsx` reads the params).
    - **Interview prep**: accordion by round, each question expandable to show why it's asked and the answer points.
    - **Cover letter**: editable textarea, tone and length regenerate, copy, download `.txt`, save to job.
- **Home** (`pages/user/UserHome.tsx`) becomes a career snapshot:
  - **this week's goals** with progress bars, an edit-goals modal, and the 🔥 daily and weekly streak
  - follow-ups due
  - pipeline counts
  - latest match score
  - next mentoring session
- Landing (`pages/Landing.tsx`), Privacy (AI processing, PDFs not stored, structured profile stored and deletable) and README updated for the new positioning and the new env vars (`ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `AI_DAILY_LIMIT`), including `.env.example` files and `docker-compose.yml`.

## Delivery order (separate commits on `claude/confident-tesla-18fq7p`)

1. Schema, migration, env and seed.
2. Job tracker (API, tests, web board/table/drawer).
3. AI runner plus resume review and job match, the booking merge, the AI Coach page.
4. Interview questions and cover letter.
5. Weekly goals and streaks, Home snapshot, nav, landing/privacy/README.

## Verification

- Run the CI steps: `npm run db:generate`, `format:check`, `lint`, `typecheck`, `test`, `build`.
- New API tests:
  - `jobs.test.ts`: CRUD, a move writing an event and setting `appliedAt`, stats math, no access to another user's jobs.
  - `ai.test.ts`: mocks the Claude helper with `vi.mock`. Covers 202 then done, failure and refusal giving `failed`, the quota 429, the 503 with no key, PDF type and size rejection, owner-only access, and that a cover letter requires the user's own review.
  - `goals.test.ts`: progress counted from events, carry-forward, weekly and daily streak edges across the timezone and week boundary.
  - `resetDb` must truncate the new tables.
- Manual, with `docker compose up db` and `npm run dev`, driven through Playwright and Chromium as the demo client:
  - Add jobs, drag across columns, log an interview, see stats and follow-ups.
  - Run a job match from a PDF, generate questions and a cover letter, save the letter to the job.
  - Set goals and see progress and streaks update.
  - Book a Deep-Dive from a review and check that the admin booking card shows the summary.
- Make one real Claude call if `ANTHROPIC_API_KEY` is available; otherwise say that only the mocked path was tested.

## Backlog: auth hardening

Found in the October 2026 code review and parked for a later pass:

- **High: account pre-hijack through Google linking.** Signup doesn't verify emails, so anyone can create a password account with someone else's address. When the real owner later signs in with Google, `loginWithGoogle` (`apps/api/src/modules/auth/auth.service.ts`) links Google to that account, and the attacker's password keeps working. Fix: when linking Google to an account whose email was never verified, clear its `passwordHash` (or add email verification).
- **Long-lived, unrevocable sessions.** The cookie is a 7-day JWT that carries the role: a role change or a ban only applies once it expires, and logout just clears the cookie. Replace it with DB-backed sessions (random cookie ID, hashed in a `Session` table, idle and absolute expiry), so logout, "sign out everywhere" and role changes take effect at once.
- **Rate limits only on `/api/auth`.** Add a general limiter for the rest of the API (the AI polling endpoints included).
- **No security headers on the web app.** Vercel serves it without CSP, `X-Frame-Options` or `Referrer-Policy`: add them in `apps/web/vercel.json` (allowing `accounts.google.com` for sign-in).
- **Minor quota race.** Two parallel AI requests can both pass the daily count before either run is created. Fine at today's limits.
