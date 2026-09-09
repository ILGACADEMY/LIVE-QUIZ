# CHANGES.md — everything different from the original ILGACADEMY/LIVE-QUIZ

This file exists so a future you (or another developer) can see exactly
what changed and why, in one place, instead of piecing it together from
chat history. Verified with a clean `npx tsc --noEmit` and a full
`next build` (the only build failures were this sandbox's inability to
reach fonts.googleapis.com — a sandbox network restriction, not a code
issue; Vercel's build servers have normal internet access).

## 1. Image + video questions, and a real upload bug fix

**The bug:** `QuestionEditor.tsx`'s upload handler swallowed every error
silently — an expired admin session, an oversized file, or an unsupported
type all just reset the button with no message. Fixed: `/api/upload`
now returns a specific error for each case, and the editor displays it.

**Video support:** questions can now hold a video instead of an image
(`questions.media_type`, `'image' | 'video'`). Videos play with sound via
a standard `<video controls>` element — the only browser restriction is
blocking *autoplay* with sound before a user interacts, which never
applies here since someone always taps to open the question first.

**The whitelist bug this would have hit:** `src/lib/question-fields.ts`
maintains an explicit whitelist of columns ever written to `questions` —
without adding `media_type` to it, every quiz save would have silently
reverted every question back to `media_type: 'image'` regardless of what
was actually uploaded. Fixed before it ever shipped.

**New builder control:** "Question timer (live sessions)" in the quiz
settings tab — how long each question stays open before auto-reveal
(`quizzes.question_timer_seconds`, default 20s, all scoring modes).

## 2. Presenter-controlled, synchronized session mechanics

The single biggest change. Previously each participant progressed through
questions independently (`participants.current_question_index`, their own
clock). Now one question is live for the whole room at once
(`sessions.current_question_index`, `sessions.phase`,
`sessions.phase_deadline`), and:

- The presenter's one control does double duty: **"Reveal answer"** while
  a question is live (cuts the timer short, or is a no-op if it already
  auto-revealed), then **"Next question"** once revealed. Two clicks per
  question, matching the Kahoot/Menti pattern of giving the room a beat to
  see the answer before moving on.
- **Automatic reveal still happens without any click** if the timer runs
  out — whichever request notices the deadline has passed (a participant's
  poll or the admin dashboard's) flips it, self-healing rather than
  depending on a cron job.
- Two previously per-quiz settings are superseded for live sessions:
  `after_answer_mode` (now only affects the solo admin Preview walkthrough)
  and `time_limit_minutes` (an overall race clock doesn't fit a
  presenter-paced room — each question has its own timer instead).

Files: `src/lib/realtime.ts`, `src/lib/types.ts`,
`src/app/api/sessions/[id]/{start,state,answer,advance}/route.ts`,
`src/app/play/[sessionId]/page.tsx`,
`src/components/admin/AdminSessionDashboard.tsx`.

## 3. Required Name, Store, City — and why Mobile-or-Email matters

The original join screen only asked for an optional name (blank = random
guest name), no store/city field existed at all. Now:

- **Name, Store, and City are all required.** No guest-name fallback.
- **At least one of Mobile or Email is required too** — this is what
  makes duplicate-attempt prevention possible.

### Duplicate prevention: what's actually possible

**IMEI checking is not possible, full stop.** IMEI is a hardware
identifier that only a native app with carrier/OS-level privileges can
read. No website — regardless of framework, regardless of being a PWA —
has ever had, or will have, browser API access to a device's IMEI. This
isn't a limitation specific to this app; it's a universal mobile OS
restriction (iOS never exposes it to any app; Android has blocked it for
regular apps since Android 10).

**What this app does instead:** requires Mobile or Email at join, and
uses it as an identity key *scoped to that one session*
(`participants.mobile` / `.email`, each with a partial unique index on
`(session_id, mobile)` / `(session_id, email)`). If someone tries to join
the same session twice with the same number/email — including from a
different device — they're recognized and **resumed into their existing
participant record** rather than allowed to create a second one. This is
a deliberate design choice: a hard reject would also lock out the
legitimate case (their browser storage got cleared, they refresh and
re-enter the same details) — resuming handles both cases the same way,
correctly.

**Honest limits of this approach:** someone determined to answer twice
can still use a second phone number or a throwaway email address — there
is no way to close that gap from a web app. What this *does* solve
reliably is the accidental case (refresh, different device, cleared
storage) and raises real friction against casual double-attempts, which
is the realistic threat in a live in-person training session with a
presenter watching the room.

Files: `src/app/api/sessions/[id]/join/route.ts`,
`src/app/join/[sessionId]/page.tsx`, `supabase/schema.sql`.

**Update:** Mobile is now required outright (not "mobile-or-email") and
Email is purely optional — there is no email-sending feature in this app,
so there was no reason to require an email address. Mobile alone is what
does the duplicate-prevention work.

## 4. Leaderboard filtering by store and city

- **Public leaderboard** (`/leaderboard/[sessionId]`): store/city filter
  dropdowns, each still returning a Top 10 — filtering happens *within*
  the existing Top-10-only privacy design, never exposing the full list.
  A name search box is also client-side-only, highlighting within the
  already-fetched Top 10 rather than looking up an arbitrary participant's
  rank (which would have quietly broken that same privacy boundary).
- **Admin dashboard** full ranking: real search — name, store, and city
  filters over the complete list, since the admin already has unrestricted
  access to it.
- CSV export (`?type=leaderboard`) now includes Store, City, Mobile, and
  Email columns.

Files: `src/app/api/sessions/[id]/leaderboard/route.ts`,
`src/app/leaderboard/[sessionId]/page.tsx`,
`src/components/admin/AdminSessionDashboard.tsx`,
`src/app/api/sessions/[id]/export/route.ts`.

## 5. One-time logo upload

`app_settings` (single row, `logo_url`) + `<SiteLogo>`, a server component
wired directly into the root layout (`src/app/layout.tsx`) — so it's
genuinely on every page with zero per-page work. Upload via
`POST /api/admin/branding`. Renders nothing if no logo is set yet (no
broken-image placeholder).

Files: `src/app/api/admin/branding/route.ts`,
`src/components/shared/SiteLogo.tsx`, `src/app/layout.tsx`.

## 6. The Meridian wordmark

A dedicated `<MeridianWordmark>` component, set in `Italiana` — a
distinct, thinner editorial display face pulled in specifically for this,
separate from the `Fraunces` italic already used for ordinary headings
elsewhere, so it reads as a standalone brand mark rather than blending in.
Used on the join/scan screen and the presenter's QR panel — the two
screens people are actually looking at before a quiz starts.

Files: `src/components/shared/MeridianWordmark.tsx`, `src/app/layout.tsx`
(font registration), `tailwind.config.ts` (`font-wordmark` utility).

## 7. Per-quiz translation toggle (cost control)

Multi-language support already existed, but it ran for every quiz
automatically — each question gets translated by AI on first use per
language, which is a real, ongoing cost, not a one-time one. Now it's
opt-in per quiz (`quizzes.translation_enabled`, default **off**):

- A toggle in the quiz builder's settings tab, right next to the other
  feature toggles, with the cost trade-off spelled out in the UI itself.
- When off: the language picker doesn't appear on the join screen at all
  (not just disabled/grayed — genuinely hidden), and every participant
  sees the quiz in English.
- **Enforced server-side, not just hidden in the UI** — the join route
  forces English regardless of what's submitted if the quiz has
  translation off, and the state route (the thing that actually calls
  Claude) checks the same flag again independently before ever making a
  translation call. Two backstops, so there's no path — direct API call,
  stale client state, anything — that triggers a translation charge for a
  quiz that wasn't opted in.

Files: `src/components/admin/QuizEditor.tsx`,
`src/app/api/sessions/[id]/join/route.ts`,
`src/app/api/sessions/[id]/state/route.ts`,
`src/app/join/[sessionId]/page.tsx`, `supabase/schema.sql`,
`supabase/upgrade_existing_database.sql`.

## 8. Fixed uploads failing on larger files (the real cause of "network error, never reached the server")

The earlier upload fix (item 1 above) routed the file through `/api/upload`
on our own server. That works for small images but silently fails for
anything near or above **~4.5MB** — that's Vercel's hard Serverless
Function request-body limit, enforced by the platform itself before any
of our code runs. A request cut off by that limit looks, from the
browser's side, exactly like a network error — because the connection
genuinely never completed. This is almost certainly what was happening
for videos (up to 50MB) and larger photos.

**The fix:** the browser now uploads file bytes **directly to Supabase
Storage**, never through our own server at all.
`POST /api/upload/sign` returns a short-lived signed upload token (a tiny
JSON exchange, no file bytes — never hits any size limit), and the actual
upload goes straight from the browser to Supabase Storage using that
token. The old `/api/upload/route.ts` (the proxy-through-server approach)
has been removed entirely rather than left as a second, still-broken path.

Files: `src/app/api/upload/sign/route.ts` (new),
`src/app/api/upload/route.ts` (removed),
`src/components/admin/QuestionEditor.tsx`.

## Migration note

**If you're upgrading your existing live deployment (you already have this
app's Supabase project running):** run `supabase/upgrade_existing_database.sql`
once in the Supabase SQL Editor. Do NOT run `supabase/schema.sql` — that file
is written for a brand new, empty Supabase project and will silently skip
every table you already have, missing all the new columns.

**If you're setting up a fresh Supabase project from scratch:** run
`supabase/schema.sql` — it already reflects the final state directly.
