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

## 9. Leaderboard now shows live standings, not just final results

Real bug: the leaderboard only included participants once `completed_at`
was set, but in the presenter-controlled model, that only happens for
**everyone at once**, at the very last question. Clicking "Show
leaderboard" at any earlier point always showed "0 finished so far" and
an empty list, no matter how far into the quiz you were.

**Fixed:** the leaderboard now ranks every joined participant by their
current `total_score` at all times — scores are already locked in
server-side per question, so this is correct whether it's checked after
question 1, after question 5, or after the quiz ends (it just naturally
becomes the final result once nobody's score can change anymore). A
separate `completedCount` is still tracked and shown alongside it for
context ("X joined, Y finished"), but no longer gates who appears in the
ranking.

Files: `src/app/api/sessions/[id]/leaderboard/route.ts`,
`src/app/leaderboard/[sessionId]/page.tsx`.

## 10. Join count removed from participant-facing screens

The live "X people have joined" count was originally added to the join
form and the post-join waiting room too, alongside the presenter's
dashboard. Clarified: this is a presenter-only tool for judging when to
start — participants don't need or want to see it. Removed from both
participant screens; unchanged on the presenter's dashboard and QR panel,
where it's still live and prominent.

Files: `src/app/join/[sessionId]/page.tsx`, `src/app/play/[sessionId]/page.tsx`.

## 11. Expanded avatar set to 500 icons

Previously only 12 emoji were in rotation, so in any room over 12 people
duplicates were guaranteed. Now there are 500 distinct emoji — generated
and deduplicated programmatically (not hand-typed) to rule out accidental
repeats or invalid characters. This is purely static text data, so it
adds no cost and negligible bundle size — no image generation, no
storage, nothing ongoing.

Assignment is still simple random selection (unchanged), so with 500
options collisions are far rarer than before but not impossible in a very
large room — happy to make assignment "no repeats until everyone's had a
distinct one" if that matters for a specific session.

Files: `src/lib/avatars.ts`.

## 12. Reveal redesigned: presenter sees everything, participants see only correct/incorrect

Previously the full reveal (correct answer, explanation) went straight to
every participant's phone, and the presenter's own dashboard showed
nothing about the question at all — not even while it was live. Both
sides of that are now fixed:

- **Presenter dashboard** now shows the live question and options while
  it's active, and once revealed, the correct answer, a per-option
  response distribution (count + percentage, with a filled bar), and the
  question's explanation — all presenter-only, live, as it happens.
- **Participant's phone** shows only a plain "Correct!" / "Not quite" /
  "Time's up" verdict at reveal — no answer text, no explanation, no
  question content at all. This isn't just hidden in the UI: the
  server-side response to participants during reveal no longer includes
  any of that data in the first place, so it can't be seen via the
  browser's network inspector either.
- **The full breakdown moves to the results/download page** — this
  already existed (per-question correct/incorrect, the correct answer,
  the explanation, and AI feedback when enabled) and needed no changes;
  it's now the *only* place a participant sees the answer content, rather
  than duplicating it mid-quiz.

Note: this does not change the Supabase realtime-connection capacity
question from earlier — it reduces payload size slightly but doesn't
affect how many concurrent connections a session uses. That's a separate,
still-open optimization.

Files: `src/app/api/sessions/[id]/state/route.ts`,
`src/app/play/[sessionId]/page.tsx`,
`src/components/admin/AdminSessionDashboard.tsx`.

## 13. Auto-reveal now also triggers when everyone has answered, not just on timeout

Previously the only automatic trigger was the timer expiring. Now there
are two, either is enough: the timer runs out (unchanged), **or**
everyone who joined has already answered — no reason to make a room of
40 people wait out a 20-second timer if all 40 answered in the first 6
seconds. The presenter can still always reveal early manually too, same
as before; this is purely an additional automatic trigger, not a
replacement for the manual one.

To keep this cheap, the "has everyone answered" check only runs when the
timer hasn't expired yet — if it already has, that check would be
redundant, so the two extra COUNT queries this needs are skipped entirely
in that case.

Confirmed unchanged, per your message: advancing to the *next* question
after a reveal is still always a manual presenter click — this only
affects when a question gets revealed, never when the room moves on.

Files: `src/app/api/sessions/[id]/state/route.ts`.

## 14. Leaderboard: correct-count added, and a real "which city/store is winning" view

Two additions to the leaderboard, both on `GET /api/sessions/:id/leaderboard`:

- **Individual view (Top 10, and the admin's full ranking):** each row now
  shows a correct-answer fraction ("3/4") alongside the total points —
  computed from the quiz's actual question count, not questions attempted
  so far, so it reads consistently throughout the quiz.
- **New team views** (`?view=byCity` / `?view=byStore`): a genuinely
  different ranking, not a filter — this sums total points per city (or
  per store) across everyone from there and ranks cities/stores against
  each other. **Deliberately shows no participant names** — the point is
  "which city is leading", not "who is leading". These view toggles only
  appear on the public leaderboard page when there's more than one
  distinct city/store, since ranking one city against itself isn't
  meaningful.

The existing store/city *filter* dropdowns (narrowing the individual
Top 10 down to just people from one place) are a different, separate
feature from this — both still exist, doing different jobs: the filter
answers "who's winning from Dubai specifically", the new team view
answers "is Dubai winning overall".

Files: `src/app/api/sessions/[id]/leaderboard/route.ts`,
`src/app/leaderboard/[sessionId]/page.tsx`,
`src/components/admin/AdminSessionDashboard.tsx`.

## 15. Fixed: answer screen reverting, "Correct" then "Time's up" flicker, missing score on finish, AI analysis missing from downloaded PDF

Four related bugs, all real, all fixed:

- **Tapping an answer sometimes reverted back to the question screen.**
  Root cause: the background check that refreshes the screen every 2.5s
  doesn't know an answer was just submitted until the server has
  recorded it — if that refresh happened to fire in the small window
  between tapping and the server confirming, it would see "not answered
  yet" and revert the screen. Fixed with a guard: while a submission is
  in flight, background refreshes are skipped entirely, and one
  authoritative refresh runs immediately after the submission actually
  settles.
- **Occasionally showed "Correct!" and "Time's up" in quick succession.**
  Same root cause, different symptom — a background refresh caught the
  reveal a moment before this participant's own answer had finished being
  recorded (looking exactly like an unanswered "Time's up"), then the
  next refresh caught the real result. Fixed by the same guard above.
- **No score/ranking visible right after finishing.** The "quiz complete"
  screen was a dead-end middle step with no score on it at all — you had
  to notice and tap "View my results" to see anything. Removed entirely;
  finishing the quiz now goes straight to the results page, which already
  had the score, percentage, and rank.
- **AI analysis sometimes missing from the downloaded PDF.** The download
  button used the browser's print function immediately, whenever clicked
  — if that was before the AI profile and feedback had finished loading
  (a real few-second delay), the PDF captured the page without them. The
  button now shows "Preparing your analysis…" and stays disabled until
  every AI call has actually finished, so a PDF made from this button
  always includes the analysis when the quiz has it enabled. This also
  directly addresses "let people read it first, then download" — this
  results page already was that "read first" page; the fix is that
  downloading from it now always waits for everything on it to actually
  be there first.

Files: `src/app/play/[sessionId]/page.tsx`, `src/app/play/[sessionId]/results/page.tsx`.

## 16. Fixed: CSV exports came back empty

Real bug, confirmed: both CSV downloads (`?type=leaderboard` and
`?type=answers`) required `completed_at` to be set on a participant
before including them at all. That was left over from before the
presenter-controlled rework — in the current model, `completed_at` only
gets set for everyone at once when the quiz naturally reaches its last
question, and **never gets set if the presenter uses "End quiz"** to stop
it early (confirmed by reading that route directly). So ending a quiz
early — a completely normal thing to do — meant both exports came back
as just a header row with nothing underneath.

Fixed: exports now include every participant who joined, exactly matching
the on-screen "Full ranking" table's behavior (which was already correct
— this bug was specific to the CSV files, not the live view). Also added
a "Correct" column (e.g. "3/4") and a "Completed" yes/no column to the
leaderboard CSV, since the data was already available from the same fix.

Files: `src/app/api/sessions/[id]/export/route.ts`.

## 17. Fixed: participants got nothing after "End quiz" — no results, no AI feedback, no PDF

The real root cause behind several symptoms at once. "End quiz" only ever
set the *session's* status to finished — it never marked any participant
as complete. Every downstream piece (the results page, AI feedback, the
PDF download, and the AI group-analysis's "not enough participants"
message) all specifically required a participant's `completed_at` to be
set, which normally only happens automatically when a quiz reaches its
actual last question. So ending a quiz early — a completely normal thing
to do — left every participant's phone on a bare "session ended" screen
with no path to their score, feedback, or download at all, and the AI
group-analysis wrongly reported "not enough participants" even when the
whole room had answered plenty.

**Fixed at the root:** "End quiz" now marks every participant complete
(based on whatever they'd actually answered) at the moment it's clicked —
the same thing that already happens automatically on a natural finish.
Everyone now gets routed straight to their real results, AI feedback, and
PDF download, whether the quiz ran its full length or was ended early.

Also fixed along the way: the AI group-analysis endpoint had the same
completed-only requirement bug as the CSV exports (item 16) — same fix
applied, plus a correction to its average-completion-time math so it
divides by how many participants actually finished, not by everyone in
the room (which was quietly dragging the average down).

**Also addressed directly:** the "End quiz" confirmation now only warns
about cutting someone off mid-question when a question is actually live
at that moment — not as a blanket warning regardless of context.

Files: `src/app/api/sessions/[id]/end/route.ts`,
`src/app/api/sessions/[id]/state/route.ts`,
`src/app/api/ai/analysis/route.ts`,
`src/components/admin/AdminSessionDashboard.tsx`.

## 18. Presentation clicker support

Wireless presentation clickers work by simulating ordinary keyboard key
presses — almost universally Right Arrow, Page Down, or Spacebar, the
same keys that advance a PowerPoint slide. The presenter dashboard now
listens for those and triggers the same Reveal/Next action the on-screen
button does, whenever a session is live. No pairing or setup beyond
whatever the clicker already needs to control a slide deck — it "just
works." Ignored while focus is in a text field (e.g. the post-quiz search
inputs), and a small on-screen tip makes it discoverable.

Files: `src/components/admin/AdminSessionDashboard.tsx`.

## 19. Bigger QR, a short-code fallback, richer AI learning profiles, a real fix for the submission race, and last-question button clarity

Five things, all from the same round of feedback:

- **QR code made much bigger** (200px → 340px inline, 520px in a new
  full-screen mode) for visibility across a room. A "Show QR full screen"
  button puts up a dedicated, even larger view with nothing else on
  screen.
- **New short-code fallback for joining.** Every session now gets a
  6-digit code (`sessions.short_code`, unique among currently-active
  sessions) shown right alongside the QR. A new generic `/join` page lets
  someone type that code instead of scanning — this is the real answer
  to "what if the QR won't scan" (camera permission blocked, some
  locked-down work phones) and "the link is long to type": the code is
  short, and `/join` itself is a short URL too.
- **AI learning profiles now include specific learning topics to focus
  on, not just broad categories.** Previously the participant-facing AI
  profile only knew about category-level performance. It now also
  receives a breakdown by each question's specific `learning_topic` and
  returns a `focusTopics` list naming precise things to revise (e.g.
  "Chronograph tachymeter function") rather than only a category name
  like "Movements" — shown as its own "Concentrate on these topics next"
  section on the results page.
- **A real second fix for the answer-submission race.** The earlier fix
  (checking a submission-in-flight flag before starting a background
  refresh) missed one case: a refresh that was *already* in flight when
  the answer was tapped would pass that check and still land afterward
  with stale data. Added a second check right after the network response
  comes back, which closes that gap.
- **Last-question button now says "End quiz" instead of "Next question."**
  No functional change — clicking it already finished the quiz correctly
  before — just a label fix so it doesn't imply a next question exists
  when it doesn't.

Files: `src/components/admin/AdminSessionDashboard.tsx`,
`src/app/join/page.tsx` (new), `src/app/api/sessions/by-code/[code]/route.ts`
(new), `src/app/api/sessions/route.ts`, `src/lib/ai.ts`,
`src/app/api/sessions/[id]/results/route.ts`,
`src/app/api/ai/analysis/route.ts`, `src/app/play/[sessionId]/results/page.tsx`,
`src/app/play/[sessionId]/page.tsx`, `src/lib/types.ts`, `supabase/schema.sql`,
`supabase/upgrade_existing_database.sql`.

## 20. Trainer role — run quizzes without being able to edit them

A real second login, not just a hidden button. Set a new `TRAINER_PASSWORD`
environment variable (alongside your existing `ADMIN_PASSWORD`) and hand
that password to anyone who needs to launch and run sessions in a
different region without being able to touch quiz content.

- **Same login screen, same password field** — whichever password is
  entered determines the role automatically (`ADMIN_PASSWORD` → full
  admin, `TRAINER_PASSWORD` → trainer). No separate trainer login flow to
  maintain.
- **A trainer can:** view the quiz list, launch a session, fully control
  it live (start, reveal, next, end), view the leaderboard, download the
  CSV exports, and generate the AI group analysis — everything involved
  in actually running a quiz.
- **A trainer cannot:** create, edit, duplicate, or delete a quiz
  template, upload question images/videos, or change the site logo.
  These aren't just hidden buttons — every one of those API routes
  independently rejects a trainer's request even if they somehow reached
  the URL directly.
- The login cookie now stores only the **role name** ("admin" or
  "trainer"), never the password itself — a small security improvement
  over the previous version, which stored the raw password in the cookie.

Files: `src/lib/admin-auth.ts`, `src/lib/require-admin.ts`,
`src/app/api/admin/login/route.ts`, `src/app/admin/page.tsx`,
`src/app/admin/quizzes/[id]/preview/page.tsx`,
`src/app/admin/session/[sessionId]/page.tsx`,
`src/components/admin/QuizLibrary.tsx`, and the auth check in every
session-control API route (`sessions`, `start`, `advance`, `end`,
`delete`, `leaderboard`, `export`, `ai/analysis`) — all switched from
admin-only to admin-or-trainer, while `quizzes` (create/edit/delete),
`quizzes/duplicate`, `upload/sign`, and `admin/branding` remain strictly
admin-only.

## 21. Last question finishes automatically — no extra click needed

Once the very last question is revealed (by any means — presenter click,
timer, or everyone answering), the quiz now finishes on its own within
about a second, instead of requiring a further "Next question"/"End quiz"
click. The button area shows a plain, disabled "Ending automatically…"
label during that instant rather than a clickable action, since there's
nothing left to press. Every other question is completely unaffected —
this only shortcuts the very last one, and the reveal step itself (answer,
distribution, explanation) still shows exactly as normal first.

Files: `src/app/api/sessions/[id]/state/route.ts`,
`src/components/admin/AdminSessionDashboard.tsx`.

## 22. Reverted: trainer accounts — back to one single admin login

The named/expiring/per-quiz trainer login system (item 20) added real
complexity that wasn't worth it in practice — reverted cleanly back to
the original single shared `ADMIN_PASSWORD` login, no roles, no name
field, no trainer table lookups on every request. The `/admin/trainers`
management page, the trainer API routes, and the password-hashing utility
have all been removed outright rather than left dormant.

**One thing worth knowing:** the `trainers` database table itself is
still sitting in your Supabase database (nothing dropped it) — it's just
completely unused by the app now. Harmless to leave as-is; say the word
if you'd like a cleanup script to drop it.

Files reverted: `src/lib/admin-auth.ts`, `src/lib/require-admin.ts`,
`src/app/api/admin/login/route.ts`, `src/app/admin/login/page.tsx`,
`src/app/admin/page.tsx`, `src/app/admin/quizzes/[id]/edit/page.tsx`,
`src/app/admin/quizzes/[id]/preview/page.tsx`,
`src/app/admin/session/[sessionId]/page.tsx`,
`src/components/admin/QuizLibrary.tsx`, and every session-control API
route back to the single admin check. Removed: `src/app/admin/trainers/`,
`src/components/admin/TrainerManager.tsx`, `src/app/api/trainers/`,
`src/lib/password.ts`.

## 23. Participant screens simplified further

Two more places were still showing a live count to participants (a
holdover from before "counts are presenter-only" was established) — the
"answer locked" screen showed "{N} answered", and the live question
screen showed the same in its header. Both removed; the locked screen
now just reads "Answer locked."

Files: `src/app/play/[sessionId]/page.tsx`.

## Migration note

**If you're upgrading your existing live deployment (you already have this
app's Supabase project running):** run `supabase/upgrade_existing_database.sql`
once in the Supabase SQL Editor. Do NOT run `supabase/schema.sql` — that file
is written for a brand new, empty Supabase project and will silently skip
every table you already have, missing all the new columns.

**If you're setting up a fresh Supabase project from scratch:** run
`supabase/schema.sql` — it already reflects the final state directly.
