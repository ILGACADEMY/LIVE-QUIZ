// Meridian load test — simulates many phones in one live session.
//
// Usage:   node scripts/load-test.mjs <baseUrl> <sessionId> <phones> [minutes]
// Example: node scripts/load-test.mjs https://ilgquiz.vercel.app 1234-abcd 100 5
//
// IMPORTANT: use a TEST session (a throwaway quiz), never a real event.
// The bots join, poll like real phones (every 3-4.5s), and answer
// randomly 1-8 seconds into each question. You (the presenter) click
// Start / Next as normal while the test runs. It prints how long the
// server took to respond, so you can see whether it copes.
const [base, sessionId, phonesArg, minutesArg] = process.argv.slice(2);
if (!base || !sessionId) {
  console.log("Usage: node scripts/load-test.mjs <baseUrl> <sessionId> <phones> [minutes]");
  process.exit(1);
}
const PHONES = Number(phonesArg || 50);
const MINUTES = Number(minutesArg || 5);
const stateTimes = [], answerTimes = [];
let errors = 0, joined = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const timed = async (list, fn) => {
  const t = Date.now();
  try { const r = await fn(); list.push(Date.now() - t); return r; }
  catch { errors++; list.push(Date.now() - t); return null; }
};
const pct = (a, p) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };

async function bot(i, stopAt) {
  await sleep(Math.random() * 8000); // people join over a few seconds
  const jr = await fetch(`${base}/api/sessions/${sessionId}/join`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: `LoadBot ${i}`, store: "Test", city: "Test", language: "en" })
  }).catch(() => null);
  if (!jr || !jr.ok) { errors++; return; }
  const { participant } = await jr.json();
  joined++;
  let lastAnswered = -1;
  while (Date.now() < stopAt) {
    const r = await timed(stateTimes, async () => {
      const res = await fetch(`${base}/api/sessions/${sessionId}/state?participantId=${participant.id}`);
      if (!res.ok) throw new Error("state " + res.status);
      return res.json();
    });
    if (r && r.phase === "question" && r.question && r.question.index !== lastAnswered) {
      lastAnswered = r.question.index;
      await sleep(1000 + Math.random() * 7000);
      await timed(answerTimes, async () => {
        const res = await fetch(`${base}/api/sessions/${sessionId}/answer`, {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ participantId: participant.id, questionIndex: r.question.index, selectedOption: "ABCD"[Math.floor(Math.random() * 4)] })
        });
        if (!res.ok && res.status !== 409) throw new Error("answer " + res.status);
      });
    }
    if (r && (r.phase === "finished" || r.phase === "ended")) break;
    await sleep(3000 + Math.random() * 1500);
  }
}

const stopAt = Date.now() + MINUTES * 60000;
console.log(`Starting ${PHONES} simulated phones for up to ${MINUTES} min against ${base}`);
const report = setInterval(() => {
  console.log(`[${new Date().toLocaleTimeString()}] joined ${joined}/${PHONES} | status checks ${stateTimes.length} p50 ${pct(stateTimes, .5)}ms p95 ${pct(stateTimes, .95)}ms max ${pct(stateTimes, 1)}ms | answers ${answerTimes.length} p95 ${pct(answerTimes, .95)}ms | errors ${errors}`);
}, 10000);
await Promise.all(Array.from({ length: PHONES }, (_, i) => bot(i, stopAt)));
clearInterval(report);
console.log("\nFINAL");
console.log(`status checks: ${stateTimes.length}, p50 ${pct(stateTimes, .5)}ms, p95 ${pct(stateTimes, .95)}ms, max ${pct(stateTimes, 1)}ms`);
console.log(`answers: ${answerTimes.length}, p50 ${pct(answerTimes, .5)}ms, p95 ${pct(answerTimes, .95)}ms, max ${pct(answerTimes, 1)}ms`);
console.log(`errors: ${errors}   (healthy: p95 under ~1000ms, zero errors)`);
