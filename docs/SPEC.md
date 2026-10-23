# MentorLoop revamp: feature spec

This spec describes **what** to build and **how we know it's done**. File-level steps (modules, endpoints, delivery order) are in [`revamp-plan.md`](./revamp-plan.md). If the two files disagree, fix one so they match.

## 1. Overview

**Goal:** turn MentorLoop from a single-mentor booking app into a **job-search toolkit with human mentoring built in**. A candidate tracks every application in one place, uses AI to tailor their resume and prepare for interviews, keeps momentum with weekly goals, and books a mentor when they need a human.

**Users**

| Role               | What they do                                                                                    |
| ------------------ | ----------------------------------------------------------------------------------------------- |
| Candidate (`user`) | Tracks jobs, runs AI match, interview prep and cover letters, sets weekly goals, books sessions |
| Mentor (`admin`)   | Manages services, availability and bookings; sees the AI review attached to a booking           |

**Current state (branch `claude/confident-tesla-18fq7p`)**

- Done: the database schema and migration for every feature below (`apps/api/prisma/schema.prisma`, migration `career_toolkit`), the AI env vars, the renamed services and demo seed data, dev tooling (F0), the job tracker (F1), the AI runner (F2), resume review / job match (F3), the booking merge (F4), interview questions (F5), cover letters (F6), weekly goals and streaks (F7), the Home snapshot and navigation (F8), and the landing, privacy and README refresh (F9).
- Left from the Definition of Done: new README screenshots, and confirming `docker compose up --build`.

## 2. Feature status

| #   | Feature                                       | Priority | Status | Plan step |
| --- | --------------------------------------------- | -------- | ------ | --------- |
| F0  | Dev tooling: `npm run dev` starts API and web | P0       | Done   | 2         |
| F1  | Job tracker                                   | P0       | Done   | 2         |
| F2  | AI shared runner (quota, async, errors)       | P1       | Done   | 3         |
| F3  | AI resume review / job match                  | P1       | Done   | 3         |
| F4  | Booking merge (attach AI review to a session) | P1       | Done   | 3         |
| F5  | AI interview questions                        | P1       | Done   | 4         |
| F6  | AI cover letter                               | P1       | Done   | 4         |
| F7  | Weekly goals and streaks                      | P1       | Done   | 5         |
| F8  | Home snapshot and navigation                  | P1       | Done   | 5         |
| F9  | Landing, Privacy and README refresh           | P2       | Done   | 5         |

**Backlog (not in this revamp)**

- Career tracks: Software, AI and QA Engineer, each with Fresher / Intermediate / Advanced steps and per-user progress.
- YouTube video library: the admin pastes a URL or ID and it shows as a card; videos can be attached to a track step.
- AI interview questions per career track.
- CSV export of the job tracker.
- Email follow-up reminders (outbox and job queue).
- Google sign-in on localhost (config only: add `http://localhost`, `:8080` and `:5173` to the OAuth client's origins).

---

## F0. Dev tooling

**Why:** `npm run dev` runs workspace scripts one after another, so the API's watch process blocks the web app from ever starting. The README says one command starts both.

- **FR-DEV-1** `npm run dev` at the repo root starts the API (:4000) and web (:5173) in parallel, with output prefixed by app name.
- **FR-DEV-2** Ctrl+C stops both.

**Acceptance:** after `npm run dev`, both `http://localhost:4000/api/health` and `http://localhost:5173` respond.

---

## F1. Job tracker

**Why:** candidates apply to dozens of jobs and lose track of what they applied for, who to follow up with and which interviews are coming. This is the core of the product, and every other feature hangs off a saved job.

### User stories

- As a candidate, I want to save a job in seconds (company, title, link) so I don't lose it.
- As a candidate, I want to see all my applications on a board by stage and drag them as they progress.
- As a candidate, I want reminders of who to follow up with, so applications don't go cold.
- As a candidate, I want to log interview rounds and outcomes, so I can prepare and look back.
- As a candidate, I want simple stats (response rate, interviews, offers) to know whether my approach works.

### Statuses

| Status         | Meaning                                  | Active? |
| -------------- | ---------------------------------------- | ------- |
| `wishlist`     | Saved, not applied yet                   | —       |
| `applied`      | Application sent                         | Yes     |
| `assessment`   | Online test or take-home                 | Yes     |
| `interviewing` | In interview rounds                      | Yes     |
| `offer`        | Offer received                           | Yes     |
| `accepted`     | Offer accepted                           | Final   |
| `rejected`     | Company said no                          | Final   |
| `withdrawn`    | Candidate pulled out                     | Final   |
| `ghosted`      | No response, the candidate gave up on it | Final   |

### Fields (validation as in `jobs.schema.ts`)

| Field                                 | Rules                                                        |
| ------------------------------------- | ------------------------------------------------------------ |
| `company`                             | Required, 1–120 chars                                        |
| `title`                               | Required, 1–160 chars                                        |
| `jobUrl`                              | Optional, valid URL, max 1000                                |
| `location`                            | Optional, max 120                                            |
| `workMode`                            | `onsite` / `hybrid` / `remote`                               |
| `salaryMin`, `salaryMax`              | Optional integers ≥ 0; min ≤ max                             |
| `currency`                            | Optional, max 8 (e.g. `BDT`, `USD`)                          |
| `source`                              | Optional, max 60 (LinkedIn, referral, BDJobs, company site…) |
| `status`                              | One of the 9 statuses, default `wishlist`                    |
| `priority`                            | 1–3 (stars), default 2                                       |
| `appliedAt`, `followUpAt`, `deadline` | Optional dates                                               |
| `contactName`                         | Optional, max 120                                            |
| `contactEmail`                        | Optional, valid email                                        |
| `jobDescription`                      | Optional, max 20,000                                         |
| `notes`                               | Optional, max 5,000                                          |
| `coverLetter`                         | Optional, max 10,000 (the user's final edited letter)        |

On update, sending `''` clears a field and leaving a key out keeps its value.

### Functional requirements

- **FR-JOB-1** A candidate can create, view, edit and delete their own jobs. Quick-add only needs company and title, with an optional link.
- **FR-JOB-2** A candidate only ever sees and changes **their own** jobs. Another user's job ID returns 404.
- **FR-JOB-3** Status change rules, applied whether the status changes through drag, select or edit:
  - Every change writes a `status_change` event with the old and new status.
  - The first move to an active or final status (anything except `wishlist` and `withdrawn`) sets `appliedAt` to now, if it's empty.
  - Moving to `applied` sets `followUpAt` to 7 days after `appliedAt`, if it's empty.
  - Moving to a final status clears `followUpAt`.
- **FR-JOB-4** Timeline events:
  - **Interview round**: title, `scheduledAt`, outcome (`pending` / `passed` / `failed`), notes. Adding one to an `applied` or `assessment` job moves it to `interviewing` (FR-JOB-3 applies).
  - **Note**: free text.
  - **Follow-up**: logs that the candidate followed up and moves `followUpAt` to `nextFollowUpAt`, or 7 days from now by default.
  - Events can be edited (title, date, outcome, notes) and deleted.
- **FR-JOB-5** List: search across company and title, filter by status, sort by updated, created, applied, company or priority. List responses leave out `jobDescription` and `coverLetter`.
- **FR-JOB-6** Board order: each job has a `position` in its column, and dragging updates the status and position together.
- **FR-JOB-7** Stats for the current user:
  - Count per status.
  - **Applied** = jobs with `appliedAt` set.
  - **Response rate** = applied jobs that reached `assessment`, `interviewing`, `offer`, `accepted` or `rejected` ÷ applied.
  - **Interview rate** = applied jobs that reached `interviewing` or later (current status or any `status_change` event) ÷ applied.
  - **Offers** = jobs that reached `offer` or `accepted`.
  - **Applied in the last 7 days**.
  - **Follow-ups due** = active jobs with `followUpAt` ≤ now.
  - **Upcoming interviews** = the next 5 interview events with `scheduledAt` ≥ now.
  - Rates are 0 (not NaN) when nothing has been applied for.

### Acceptance criteria

- **Given** a job in `wishlist`, **when** I drag it to `applied`, **then** `appliedAt` is today, `followUpAt` is 7 days later, and the timeline shows "wishlist → applied".
- **Given** an applied job, **when** I add an interview round, **then** the job moves to `interviewing` and the round shows in the timeline.
- **Given** a follow-up date in the past, **when** I open the tracker, **then** the job appears under "Follow-ups due". **When** I log a follow-up, **then** it leaves the list and the next follow-up is 7 days away.
- **Given** a job owned by user A, **when** user B requests it, **then** the API returns 404.
- **Given** `salaryMin` 100 and `salaryMax` 50, **when** I save, **then** I get a field error on `salaryMax`.

### Data and API

- Models: `JobApplication`, `JobEvent` (see `schema.prisma`).
- `GET/POST /api/jobs`, `GET/PATCH/DELETE /api/jobs/:id`, `PATCH /api/jobs/:id/move`, `POST /api/jobs/:id/events`, `PATCH/DELETE /api/jobs/:id/events/:eventId`, `GET /api/jobs/stats`.

### UI

- **Board** (default on desktop): one column per status. Final statuses can be collapsed. Cards show company, title, priority stars, work mode, the follow-up badge and the next interview date. Drag and drop works with the mouse. On touch screens and by keyboard, a status select on the card does the same job.
- **Table** (default on mobile): search, status filter, sort.
- **Stats strip**: applied, response rate, interviews, offers, follow-ups due.
- **Job drawer** with tabs: Details (editable) · Timeline (add interview, follow-up, note) · AI (F3, F5, F6).
- States: an empty state with a "Add your first job" call to action, skeletons while loading, toasts on errors.

**Out of scope:** importing from LinkedIn or browser extensions, attachments, shared or team boards.

---

## F2. AI shared rules (applies to F3, F5 and F6)

- **FR-AI-1 Model:** `ANTHROPIC_MODEL`, default `claude-haiku-5-5`, effort `medium`. Estimated cost is under $0.01 per call.
- **FR-AI-2 Structured output:** every feature has a zod schema, and the response is parsed and validated against it. Scores are clamped to 0–100.
- **FR-AI-3 Async:** `POST` creates an `AiRun` with status `processing` and returns **202** straight away; the AI call runs in the background. The UI polls `GET /api/ai/runs/:id` every 2 s until the run is `done` or `failed`. On server start, runs still `processing` after 5 minutes are marked `failed`.
- **FR-AI-4 Quota:** up to `AI_DAILY_LIMIT` runs (default 10) per user in a rolling 24 hours, across all AI kinds. The mentor is exempt. Over the limit returns **429** with "You've used today's AI limit. Try again tomorrow."
- **FR-AI-5 Off switch:** with no `ANTHROPIC_API_KEY`, AI endpoints return **503**, `/api/auth/config` reports `aiEnabled: false`, and the UI hides every AI button.
- **FR-AI-6 Failures:**
  - A refusal, a cut-off response (`max_tokens`), a schema mismatch, a rate limit or an API error marks the run `failed` with a user-safe message. Raw API errors are never shown.
  - The UI offers **Retry**.
  - Haiku has no server-side fallback model.
- **FR-AI-7 Prompt injection:** resume and job text are wrapped and labelled as untrusted data. The system prompt tells the model to ignore any instructions inside them.
- **FR-AI-8 Privacy:** the PDF is sent to the model and **never stored**. We store the input settings, the structured result (including the extracted `profile`) and, only for pasted text, the text itself. Users can delete any run.
- **FR-AI-9 Ownership:** runs are owner-only (404 for others). `jobId` and `reviewId` inputs must belong to the user.

**Endpoints:** `GET /api/ai/runs?kind=&jobId=`, `GET /api/ai/runs/:id`, `DELETE /api/ai/runs/:id`.

---

## F3. AI resume review / job match

**Why:** generic resume feedback is everywhere. Matching **your** resume against **a job you saved**, and keeping the result on that job, is not.

### User stories

- As a candidate, I want to check my resume against a saved job so I know my match score and which skills are missing.
- As a candidate, I want concrete rewrites of my weak bullet points that I can copy.
- As a candidate, I want a general review when I have no specific job in mind.

### Inputs

- Resume: a **PDF** (max 5 MB; MIME type `application/pdf` and the file must start with `%PDF`) **or** pasted text (1–30,000 chars). Exactly one of the two.
- Target, optional:
  - `jobId`: uses that job's title, company and description.
  - or `targetRole` (max 120) plus `jobDescription` (max 20,000).
  - Nothing: a general review.

### Output (structured)

| Field               | Type                                                                                                                            |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `overallScore`      | 0–100                                                                                                                           |
| `atsScore`          | 0–100 (how well an applicant tracking system can parse it)                                                                      |
| `summary`           | 2–3 sentences                                                                                                                   |
| `seniority`         | `fresher` / `junior` / `mid` / `senior` / `lead`                                                                                |
| `sections[]`        | `{ name, score, feedback }`                                                                                                     |
| `strengths[]`       | strings                                                                                                                         |
| `improvements[]`    | `{ priority: high / medium / low, issue, fix }`                                                                                 |
| `bulletRewrites[]`  | `{ original, improved, why }`                                                                                                   |
| `missingKeywords[]` | strings                                                                                                                         |
| `redFlags[]`        | strings (gaps, typos, formatting)                                                                                               |
| `jobMatch`          | `{ score, matchedSkills[], missingSkills[], verdict }`, or `null` with no target                                                |
| `profile`           | `{ headline, skills[], experience[{ role, company, period, highlights[] }], projects[{ name, summary, tech[] }], education[] }` |

`AiRun.score` = `jobMatch.score` when there's a target, otherwise `overallScore`.

### Acceptance criteria

- **Given** a saved job with a description, **when** I click "Check my resume against this job" and upload a PDF, **then** I see a processing state, and within about a minute the match score, missing skills and rewrites, saved on that job's AI tab.
- **Given** a 6 MB file or a `.docx` renamed to `.pdf`, **when** I upload it, **then** I get a 400 with a clear message.
- **Given** a finished review, **when** I click "Book a Resume Deep-Dive with this review", **then** the booking flow opens with that service selected and the review attached (F4).

### UI

- **AI Coach page:** a "New review" panel (PDF dropzone or paste tab, optional target role) and history tabs for Reviews, Interview prep and Cover letters.
- **Result view:**
  - score rings (overall, ATS, match)
  - section scores
  - improvements sorted by priority
  - before → after bullet rewrites with copy buttons
  - keyword chips and red flags
  - the booking call to action

---

## F4. Booking merge

**Why:** connects the self-serve AI with the paid human service. The mentor starts the session already prepared.

- **FR-BOOK-1** Bookings accept an optional `resumeReviewId`. It must be the user's own `resume_review` run with status `done`; anything else returns 400.
- **FR-BOOK-2** The mentor's booking list and cards show the attached review's score and summary.
- **FR-BOOK-3** The booking page reads `?service=…&review=…` to preselect the service and attach the review.
- **FR-BOOK-4** Services are named "Resume Deep-Dive", "Career Guidance Call" and "Mock Interview" (already in the seed).

**Acceptance:** **given** a booking made from a review, **when** the mentor opens Bookings, **then** they see "AI review: 72/100" with the summary.

---

## F5. AI interview questions

**Why:** candidates prepare with generic question lists. Questions built from the actual job description and their own projects are far more useful.

- **Input:** `jobId` (required) and an optional `reviewId` (adds the candidate's `profile`).
- **Output:**
  - `rounds[]`: `{ category, questions[] }`, with category one of `technical`, `system_design`, `behavioral`, `role_specific`, `company_culture`.
  - Each question: `{ question, whyAsked, answerPoints[], difficulty: easy / medium / hard, fromResume: boolean }`.
  - `questionsToAsk[]`: questions for the candidate to ask the interviewer.
- **FR-IQ-1** About 15–25 questions in total. With a `reviewId`, at least 3 have `fromResume: true`.
- **UI:** in the job drawer's AI tab and AI Coach → Interview prep. An accordion by round; each question expands to show why it's asked and the answer points.

**Acceptance:** **given** a "Backend Engineer (.NET)" job and a review, **when** I generate questions, **then** I see technical and system design rounds related to the job description and at least 3 questions about my own projects.

---

## F6. AI cover letter

**Why:** writing a tailored letter for each application is slow. Drafting one from the structured profile and the job description takes seconds, and the candidate edits the result.

- **Input:** `jobId` and `reviewId` (both required, both owned by the user), `tone` (`formal` / `friendly` / `concise`), `length` (`short` about 150 words, `standard` about 300).
- **Output:** `{ subject, greeting, paragraphs[], closing, highlightsUsed[] }`.
- **FR-CL-1** Uses only facts from the profile; the prompt forbids inventing experience.
- **FR-CL-2** The UI joins the parts into an editable textarea with Copy, Download `.txt`, Regenerate (change tone or length) and **Save to job**, which writes `JobApplication.coverLetter`.

**Acceptance:** **given** a review and a job, **when** I draft a "friendly, short" letter, edit it and click Save to job, **then** reopening the job shows my edited letter.

---

## F7. Weekly goals and streaks

**Why:** job searching is a long game and motivation drops. Small weekly targets and a visible streak keep people going.

### Metrics (computed from data, never stored as counters)

| Metric            | Counts this week                                    |
| ----------------- | --------------------------------------------------- |
| `applications`    | Jobs whose `appliedAt` falls in the week            |
| `interviews`      | `interview` events created in the week              |
| `follow_ups`      | `follow_up` events created in the week              |
| `resume_matches`  | `resume_review` runs completed (`done`) in the week |
| `interview_preps` | `interview_questions` runs completed in the week    |

### Requirements

- **FR-GOAL-1** A week runs from **Monday 00:00 to the next Monday** in the user's timezone (`User.timezone`, an IANA name set from the browser and validated).
- **FR-GOAL-2** A candidate sets 1 to 5 goals per week, with a target of 1–100 each. If a new week has no goals, last week's targets are copied forward automatically.
- **FR-GOAL-3** The **weekly streak** counts consecutive completed weeks, going back from last week, in which every goal was met. The current week adds 1 once all its goals are met.
- **FR-GOAL-4** The **daily streak** counts consecutive days, in the user's timezone, with any activity (a job event, an applied job or a finished AI run). Today counts if active. With no activity yet today, the streak continues from yesterday.
- **FR-GOAL-5** History shows the last 8 weeks with target vs actual.

**Acceptance:**

- **Given** a user in `Asia/Dhaka` who applies at 00:30 Monday local time (Sunday 18:30 UTC), **when** they view goals, **then** it counts toward the new week.
- **Given** 3 weeks in a row with all goals met, **when** the user opens Home, **then** they see "🔥 3-week streak".

**API:** `GET /api/goals/current`, `PUT /api/goals/current`, `GET /api/goals/history?weeks=8`, and `PATCH /api/auth/me { timezone }`.

---

## F8. Home snapshot and navigation

- **Navigation (candidate):** Home · Jobs · AI Coach · Sessions. "Sessions" combines Book and My sessions in tabs. The mobile tab bar holds at most 5 items. The mentor's navigation is unchanged.
- **Home widgets:**

  | Widget                        | Data source          |
  | ----------------------------- | -------------------- |
  | This week's goals, edit modal | F7                   |
  | Daily and weekly streak       | F7                   |
  | Follow-ups due                | F1 stats             |
  | Pipeline counts               | F1 stats             |
  | Upcoming interviews           | F1 stats             |
  | Latest match score            | F3 (most recent run) |
  | Next mentoring session        | Existing bookings    |

- Each widget has its own empty state with a call to action, such as "Add your first job".

---

## F9. Landing, Privacy and README

- The landing page presents the new product: track jobs → AI match and prep → goals → book a mentor.
- The Privacy page covers AI processing by Anthropic, that PDFs are not stored, that the structured profile and results are stored and deletable, and the daily limits.
- README: the feature list, the new env vars (`ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `AI_DAILY_LIMIT`), the Render setup, and new screenshots.

---

## Non-functional requirements

- **Security:**
  - Every new endpoint requires login and checks ownership.
  - All input is validated with zod.
  - Uploads are size- and type-checked in memory.
  - The AI quota is enforced on the server.
  - Secrets live only in env vars.
- **Performance:** list endpoints leave out large text fields. Indexes are as in the schema. AI calls never block a request.
- **Accessibility:** controls are labelled, the board works without drag and drop (status select), focus is visible, and colour is never the only signal.
- **Responsive:** usable at 360 px wide; the board scrolls sideways inside its container, not the whole page.
- **Theming:** every new UI works in light and dark mode using `styles/tokens.css`.
- **Consistency:** follow the existing module pattern (`routes`, `service`, `schema`) and the UI kit (`components/ui.tsx`, `Modal`, `Toast`, `Button`).

## Definition of Done (whole revamp)

- [ ] `npm run format:check`, `lint`, `typecheck`, `test` and `build` all pass (the CI steps).
- [ ] API tests per module: `jobs.test.ts`, `ai.test.ts` (Claude mocked), `goals.test.ts`, plus booking-merge cases.
- [ ] A manual walkthrough as the demo client (every acceptance criterion above) and as the mentor (sees the attached review).
- [ ] At least one real Claude call is checked with a key; everything else uses mocks.
- [ ] README, `.env.example` files and `docker-compose.yml` are updated; `docker compose up --build` works.

## Open questions

1. Should the **public demo** have AI turned on? It costs real money even with Haiku and the daily limit. Alternatives: off by default, or a lower demo limit such as 3 per day.
2. Production `ANTHROPIC_API_KEY` on Render: whose account, and what monthly spend cap?
3. Google sign-in on localhost: add the local origins to the OAuth client (config only).
