# ILG Academy — Live Quiz Engine

A reusable, Mentimeter/Kahoot-style live quiz platform built for ILG Academy: create unlimited quiz templates in a visual builder, launch a QR-code live session for hundreds of participants, score answers with a server-authoritative speed bonus, and get AI-generated feedback and analysis — all without ever touching code after setup.

This document assumes no prior experience with Next.js or Supabase. Follow it top to bottom.

---

## 1. How it works (the short version)

- **Quiz Engine** (permanent, in this codebase): the builder, live session mechanics, timer, QR join, scoring, leaderboard, AI. You never edit this to run a new quiz.
- **Quiz Content** (lives in your Supabase database): titles, questions, images, answers, scoring settings. You edit this entirely through the `/admin` web UI.
- **Live Sessions** are temporary. When you launch a quiz, the app freezes a snapshot of it at that moment — editing the template afterwards never changes a session that's already running. Session data (names, answers, scores) auto-deletes 24 hours after the session ends. The quiz template itself is never deleted by this process.

---

## 2. Architecture at a glance

| Piece | Technology | Why |
|---|---|---|
| Frontend + API | Next.js 14 (App Router, TypeScript) | One deployable app; API routes double as your backend, no separate server to run. |
| Database + Realtime + Storage | **Supabase** (managed Postgres) | Free tier comfortably handles ~300 concurrent participants for a live training session; built-in Realtime broadcast avoids you standing up a websocket server; built-in Storage hosts question images. |
| AI | Anthropic API (Claude) | Wrong-answer feedback, personal learning profiles, and admin performance analysis. |
| Hosting | Vercel (recommended) | Zero-config deploys for Next.js, generous free tier, scales automatically for a live session spike. |

**Why the admin's browser is never the database:** every join, answer, and score update writes straight to Supabase Postgres through a Next.js API route using the service-role key. The admin dashboard and every participant's phone all read from the same source of truth by polling `/api/sessions/:id/state` every ~2.5s and by subscribing to lightweight Supabase Realtime *broadcast* events for instant updates (answer counts, the synchronized 3-2-1 start). Nothing depends on the admin's laptop staying open or fast.

**Why scoring can't be gamed:** the participant's browser only ever sends *which option they picked*. The server records exactly when each question was shown to them (`current_question_started_at`) and exactly when their answer arrived — the speed bonus is computed from that server-to-server gap, never from anything the client reports (see `src/lib/scoring.ts` and `src/app/api/sessions/[id]/answer/route.ts`).

---

## 3. Install and run locally

You'll need [Node.js 20+](https://nodejs.org) installed.

```bash
npm install
cp .env.example .env
```

Now fill in `.env` — see the next two sections for where each value comes from. Once it's filled in:

```bash
npm run dev
```

Open http://localhost:3000.

---

## 4. Connect the database (Supabase)

1. Go to [supabase.com](https://supabase.com) → **New project**. Pick any name/region, wait ~2 minutes for it to provision.
2. In your new project: **Project Settings → API**. Copy three values into `.env`:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (⚠️ keep this secret — it's never sent to the browser, only used inside API routes)
3. In the left sidebar: **SQL Editor → New query**. Paste the entire contents of `supabase/schema.sql` from this repo and click **Run**. This creates all tables, security policies, the image storage bucket, and the cleanup function.
4. (Optional but recommended) Enable automatic hourly cleanup — see **"How automatic data deletion works"** below.

That's the whole database setup. You never need to open the SQL editor again for day-to-day use.

---

## 5. Configure AI (Anthropic)

1. Go to [console.anthropic.com](https://console.anthropic.com) → **API Keys** → create a key.
2. Put it in `.env` as `ANTHROPIC_API_KEY`.

If this key is missing or invalid, the app doesn't break — AI feedback/analysis sections simply won't appear, and the trainer's own written explanations (which are always shown) carry the results screen instead.

---

## 6. Set your admin password

Pick a password and put it in `.env` as `ADMIN_PASSWORD`. This is the single password that gates the entire `/admin` area. Anyone with this password can create, edit, launch, and delete quizzes — share it only with trainers who should have that access.

---

## 7. Load the sample quiz (optional)

```bash
npm run seed
```

This creates a 5-question sample quiz ("Horology Foundations — Sample Quiz") covering a standard question, an image question, a technical question, a question with wrong-answer explanations, and a speed-bonus/AI-feedback demo — so you have something to launch and test immediately.

---

## 8. Deploy it

1. Push this repo to GitHub (see **"GitHub-ready"** below).
2. Go to [vercel.com](https://vercel.com) → **New Project** → import your GitHub repo.
3. In the Vercel project's **Settings → Environment Variables**, add every variable from your `.env` file. Set `NEXT_PUBLIC_APP_URL` to the `https://your-project.vercel.app` URL Vercel gives you (this is what gets embedded in the QR code).
4. Deploy. Every future `git push` redeploys automatically.

No further deployment is needed when you only change quiz content — that all happens live through `/admin`.

---

## 9. Using the app

### Create a quiz
Go to `/admin` → log in → **+ Create new quiz**. You land in the visual builder — no code, no JSON.

### Edit questions
In the builder: fill in the question text, optionally upload an image (JPG/PNG/WEBP, replace/remove any time), fill the four answer options, click the correct letter, add an explanation (this is what participants see afterwards, and what the AI feedback is grounded in), and optionally per-wrong-answer feedback. Use **Move up / Move down / Duplicate / Delete** to manage the question order. Up to 50 questions per quiz. Click **Save**, or **Save & publish** when it's ready to go live.

### Duplicate a quiz
From **My Quizzes**, click **Duplicate** on any quiz — you get an independent copy you can safely edit without affecting the original.

### Configure scoring
In the builder's **Scoring mode** section, pick **Standard** (correct = 1 point, no bonus) or **Speed bonus** (correct = 1 point + whole seconds remaining in the configured window). Pick a window of 5/10/15/20/30 seconds, or **Custom**.

### How the speed bonus actually works
With a 20-second window: answering correctly with 18 seconds left scores `1 + 18 = 19` points; with 8 seconds left, `1 + 8 = 9` points; a wrong answer always scores `0`, regardless of speed. The "seconds left" is measured server-side from the moment the question was shown to that participant to the moment their answer arrived at the server — never from their phone's clock.

### Preview before launching
Click **Preview** from My Quizzes or the builder. It walks through the real participant flow (timer, image, answer locking, scoring) using your saved questions, without creating a live session or touching any real participant data.

### Launch a live session
Click **Launch** on a quiz. You'll land on the live admin dashboard with a QR code and join link. This freezes a snapshot of the quiz — see §1 above.

### How QR joining works
Participants scan the QR code (or open the join link) → type their name (required, no account/email/password) → land in a waiting room ("You're in / Waiting for the instructor"). When you click **Start quiz**, everyone's screen runs a synchronized 3-2-1 countdown before questions begin.

### During the live quiz
Each participant answers at their own pace within the quiz's total time limit. The moment they tap an answer, it locks immediately — no changing it, no double-submitting. They see a neutral **"Answer locked"** confirmation and a live **"X answered"** counter; they never see whether they were right or which answer was correct until the quiz ends. Your admin dashboard shows joined / in-progress / completed counts and total answers received, updating in real time.

### How the leaderboard works
Open **Show leaderboard** (a separate tab, meant for a projector) at any point — it's a Top 10 board only, ranked by highest score then fastest completion, updating live as people finish. No one outside the Top 10 is ever shown publicly. Each participant's own results screen shows their personal rank even if it's outside the Top 10. You, the admin, can see the complete private ranking (everyone, with base score / speed bonus breakdown) once the session is finished.

### How AI feedback works
On the results screen, every question a participant got wrong gets a short AI explanation grounded in the trainer's own explanation text — it's told explicitly not to invent facts beyond what you wrote. Each participant also gets an AI-generated "learning profile" (strong areas / areas to improve / one recommendation) based on their category performance. On your admin dashboard, once a session is finished, click **Generate AI analysis** for a plain-language write-up of how the whole group did, including whether accuracy dropped as people chased the speed bonus.

### How automatic data deletion works
Every session gets a `delete_at` timestamp 24 hours after it ends (or 24 hours after creation if never started). Anything past that timestamp — participants, their answers, scores, the leaderboard — is purged; the quiz template itself is completely unaffected. Two ways to run the cleanup:

- **Recommended — pg_cron inside Supabase:** in the Supabase dashboard, go to **Database → Extensions** and enable `pg_cron`. Then in the SQL Editor run:
  ```sql
  select cron.schedule(
    'cleanup-expired-quiz-sessions',
    '0 * * * *',
    $$select cleanup_expired_sessions();$$
  );
  ```
  This runs the cleanup every hour, forever, with nothing to maintain.

- **Fallback — external scheduler:** if your Supabase plan doesn't offer pg_cron, use Vercel Cron, a GitHub Actions scheduled workflow, or a free service like cron-job.org to send an hourly request:
  ```bash
  curl -X POST https://your-app-url/api/sessions/cleanup \
    -H "x-cleanup-secret: YOUR_ADMIN_PASSWORD"
  ```

You can also click **Delete session** on the admin dashboard at any time to purge a session immediately, ahead of the 24-hour window.

### Changing ILG branding
The visual identity lives in two places: `tailwind.config.ts` (the `charcoal` / `graphite` / `gold` / `ivory` color tokens and the three font variables) and `src/app/layout.tsx` (which Google Fonts are loaded — currently Fraunces for headings, Manrope for body text, Space Grotesk for the chronograph-style numerals). Change the hex values or swap the fonts there and every page picks it up automatically. The wordmark text ("ILG ACADEMY") appears inline in each page component if you want to replace it with a logo image.

---

## 10. GitHub-ready structure

```
src/
  app/
    admin/            # quiz library, builder, preview, live session dashboard
    join/[sessionId]  # participant QR-join screen
    play/[sessionId]  # participant live quiz-taking + results
    leaderboard/[id]  # projector-facing Top 10 screen
    api/
      quizzes/        # CRUD + duplicate
      sessions/       # launch, start, state, answer, leaderboard, results, end, delete, cleanup
      ai/              # feedback + analysis
      upload/          # question images
  components/
    admin/            # builder + dashboard UI
    participant/      # answer grid, countdown dial
    shared/           # toggle switch, etc.
  lib/
    supabase/         # browser (anon) + server (service-role) clients
    scoring.ts        # pure, unit-testable speed-bonus math
    ai.ts             # Anthropic API calls
    types.ts
supabase/
  schema.sql          # run once in Supabase SQL Editor
scripts/
  seed.ts             # sample quiz loader
```

Push it up normally:

```bash
git init
git add .
git commit -m "Initial commit — ILG Academy Live Quiz Engine"
git branch -M main
git remote add origin https://github.com/YOUR_ORG/ilg-live-quiz.git
git push -u origin main
```

`.env` is git-ignored — never commit real keys. Only `.env.example` (with placeholder values) is tracked.

---

## 11. Testing checklist

Before running this with a live group, walk through: create → edit → add a question → upload an image → set the correct answer → add an explanation → set standard scoring → set speed-bonus scoring with a 20s window → preview → publish → launch → scan the QR on a second device → join with a name → wait in the waiting room → start the countdown → answer a question → confirm it locks and can't be changed → confirm the live "X answered" count moves → let the timer run out on one question → finish the quiz → check the Top 10 leaderboard → check your personal rank → check AI feedback on a wrong answer → check the admin's full private ranking → generate the AI aggregate analysis → end the quiz → delete the session → confirm the quiz template still exists in My Quizzes → launch it again. Then try two phones answering the same question within a second of each other to sanity-check concurrent submissions.

For a real ~300-person session, do at least one dry run with a smaller group (10-20 people) first, and keep an eye on your Supabase project's dashboard (Database → Reports) during the live session for connection/row counts.

---

## 12. Hardening for production (optional next steps)

This ships with the simplest reasonable version of a few things, called out here so you know what to upgrade if you outgrow it:

- **Admin auth** is a single shared password (`ADMIN_PASSWORD`) rather than individual trainer accounts. For per-trainer logins with proper audit trails, migrate to Supabase Auth and gate `/admin` with real sessions instead of `src/lib/admin-auth.ts`.
- **Rate limiting** isn't implemented on the public `/api/sessions/:id/join` and `/answer` routes. For a fully public-internet deployment (rather than an internal training session), consider adding rate limiting in front of those two routes.
- **Question/answer randomization** toggles are stored on the quiz but not yet applied to the live question order — the snapshot is currently served in the saved order. Straightforward to add in `src/app/api/sessions/[id]/state/route.ts` by shuffling `quiz_snapshot.questions` (seeded per participant) when the flag is on.
