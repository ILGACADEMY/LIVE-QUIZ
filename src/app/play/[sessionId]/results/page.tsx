"use client";

import { useEffect, useState } from "react";
import { jsPDF } from "jspdf";
import { buildCertificatePdf, safeFilename } from "@/lib/certificate-pdf";
import ScoreCircle from "@/components/participant/ScoreCircle";
import RadarChart from "@/components/shared/RadarChart";

interface Breakdown {
  questionIndex: number;
  questionText: string;
  category: string;
  isCorrect: boolean;
  selectedText: string;
  correctText: string;
  explanation: string;
  baseScore: number;
  speedBonus: number;
  questionScore: number;
}

interface ResultsData {
  quizTitle: string;
  name: string;
  completedAt: string | null;
  totalScore: number;
  baseScore: number;
  speedBonus: number;
  percentage: number;
  passMarkPercent: number;
  passed: boolean;
  timeSeconds: number | null;
  aiFeedbackEnabled: boolean;
  breakdown: Breakdown[];
  categoryBreakdown: { category: string; correct: number; total: number }[];
  topicBreakdown: { topic: string; correct: number; total: number }[];
  previousAttempt: { categoryBreakdown: { category: string; correct: number; total: number }[]; scorePercent: number; completedAt: string } | null;
  profile: { xpTotal: number; quizzesCompleted: number } | null;
}

interface Profile {
  summary: string;
  strong: string[];
  improve: string[];
  focusTopics: string[];
  recommendation: string;
}

function formatTime(seconds: number | null) {
  if (seconds === null) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function ResultsPage({
  params,
  searchParams
}: {
  params: { sessionId: string };
  searchParams: { participantId?: string };
}) {
  const participantId = searchParams.participantId;
  const [data, setData] = useState<ResultsData | null>(null);
  const [rank, setRank] = useState<number | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [feedback, setFeedback] = useState<Record<number, string>>({});
  const [aiLoading, setAiLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [certificate, setCertificate] = useState<{
    certificateNumber: string;
    verifyUrl: string | null;
    participantName: string;
    quizTitle: string;
    scorePercent: number;
    issuedAt: string;
    branding: {
      logoUrl: string | null;
      orgName: string;
      orgSubtitle: string;
      message: string | null;
      brandLogoUrl: string | null;
      location: string | null;
      backgroundUrl: string | null;
      signerName: string | null;
      signatureUrl: string | null;
    };
  } | null>(null);

  useEffect(() => {
    if (!participantId) {
      setError("Missing participant. Please rejoin from the QR code.");
      return;
    }
    fetch(`/api/sessions/${params.sessionId}/results?participantId=${participantId}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error ?? "Could not load results.");
        return r.json();
      })
      .then((d: ResultsData) => setData(d))
      .catch((e) => setError(e.message));

    fetch(`/api/sessions/${params.sessionId}/leaderboard?participantId=${participantId}`)
      .then((r) => r.json())
      .then((d) => setRank(d.yourRank?.rank ?? null))
      .catch(() => {});

    // Certificate eligibility/issuance — safe to call unconditionally;
    // the route itself decides eligibility (passed + the quiz's own
    // "issue certificate" setting) and returns eligible:false otherwise,
    // so this never shows anything for a quiz that doesn't use it.
    fetch(`/api/sessions/${params.sessionId}/certificate?participantId=${participantId}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.eligible) {
          setCertificate({
            certificateNumber: d.certificateNumber,
            verifyUrl: d.verifyUrl ?? null,
            participantName: d.participantName,
            quizTitle: d.quizTitle,
            scorePercent: d.scorePercent,
            issuedAt: d.issuedAt,
            branding: d.branding
          });
        }
      })
      .catch(() => {});
  }, [params.sessionId, participantId]);

  useEffect(() => {
    if (!data || !data.aiFeedbackEnabled) return;
    setAiLoading(true);

    const profilePromise = fetch("/api/ai/analysis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "profile", sessionId: params.sessionId, participantId })
    })
      .then((r) => r.json())
      .then((d) => setProfile(d.profile))
      .catch(() => {});

    const feedbackPromises = data.breakdown
      .filter((b) => !b.isCorrect)
      .map((b) =>
        fetch("/api/ai/feedback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            questionText: b.questionText,
            participantAnswerText: b.selectedText,
            correctAnswerText: b.correctText,
            adminExplanation: b.explanation
          })
        })
          .then((r) => r.json())
          .then((d) => {
            if (d.feedback) setFeedback((prev) => ({ ...prev, [b.questionIndex]: d.feedback }));
          })
          .catch(() => {})
      );

    // Only once every AI call has settled (succeeded or failed) is the
    // page actually done — this is what the download button waits on, so
    // clicking "Download" before this resolves can't produce a PDF
    // that's missing the analysis because it printed too early.
    Promise.allSettled([profilePromise, ...feedbackPromises]).then(() => setAiLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  // A REAL downloaded PDF file, not window.print() — the old approach
  // routed through the browser's print dialog and depended on the
  // person noticing and picking "Save as PDF" as the destination, which
  // is not obvious on most phones and often doesn't work at all inside
  // an in-app browser (e.g. a QR-scanner app's built-in webview). This
  // builds and downloads an actual .pdf directly, no dialog involved.
  function downloadPdf() {
    if (!data) return;
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 48;
    let y = 56;

    function addText(text: string, opts: { size?: number; bold?: boolean; color?: [number, number, number]; gap?: number } = {}) {
      const { size = 11, bold = false, color = [20, 20, 20], gap = 16 } = opts;
      doc.setFont("helvetica", bold ? "bold" : "normal");
      doc.setFontSize(size);
      doc.setTextColor(color[0], color[1], color[2]);
      const wrapped = doc.splitTextToSize(text, pageWidth - margin * 2) as string[];
      wrapped.forEach((line) => {
        if (y > pageHeight - 60) {
          doc.addPage();
          y = 56;
        }
        doc.text(line, margin, y);
        y += gap;
      });
    }

    const correctCount = data.breakdown.filter((b) => b.isCorrect).length;
    const incorrectCount = data.breakdown.length - correctCount;
    const completedDate = data.completedAt ? new Date(data.completedAt) : null;

    addText("Meridian", { size: 12, bold: true, gap: 18 });
    addText(data.quizTitle, { size: 18, bold: true, gap: 24 });
    addText(`Participant: ${data.name}`, { size: 12, gap: 16 });
    if (completedDate) {
      addText(`Completed: ${completedDate.toLocaleDateString()} at ${completedDate.toLocaleTimeString()}`, { size: 10, color: [110, 110, 110], gap: 22 });
    }

    addText("Base Score", { size: 11, bold: true, gap: 15 });
    addText(`${correctCount} / ${data.breakdown.length}`, { size: 16, bold: true, gap: 20 });
    addText("Score", { size: 11, bold: true, gap: 15 });
    addText(`${data.percentage}%`, { size: 16, bold: true, gap: 22 });

    addText(`Correct answers: ${correctCount}`);
    addText(`Incorrect answers: ${incorrectCount}`);
    addText(`Total questions: ${data.breakdown.length}`);
    addText(`Pass mark: ${data.passMarkPercent}%`);
    addText(`Result: ${data.passed ? "PASSED" : "NOT PASSED"}`, { bold: true });
    addText(`Certificate: ${certificate ? "Issued" : "Not Issued"}`);
    addText(`Points (with speed bonus): ${data.totalScore}`);
    if (rank) addText(`Rank: #${rank}`);
    addText(`Time taken: ${formatTime(data.timeSeconds)}`, { gap: 26 });

    if (data.categoryBreakdown.length > 0) {
      addText("Knowledge by category", { size: 14, bold: true, gap: 20 });
      data.categoryBreakdown.forEach((c) => {
        const pct = Math.round((c.correct / c.total) * 100);
        addText(`${c.category}: ${c.correct}/${c.total} (${pct}%)`);
      });
      y += 10;
    }

    if (profile) {
      addText(data.name ? `${data.name}'s Learning Profile` : "Learning Profile", { size: 14, bold: true, gap: 20 });
      if (profile.summary) addText(profile.summary, { gap: 15 });
      if (profile.strong.length) addText(`Strong categories: ${profile.strong.join(", ")}`);
      if (profile.improve.length) addText(`Categories to improve: ${profile.improve.join(", ")}`);
      if (profile.focusTopics.length) addText(`Concentrate on: ${profile.focusTopics.join(", ")}`);
      if (profile.recommendation) addText(profile.recommendation, { gap: 22 });
    }

    addText("Question review", { size: 14, bold: true, gap: 20 });
    data.breakdown.forEach((b, i) => {
      addText(`${i + 1}. ${b.questionText}`, { bold: true });
      addText(`Your answer: ${b.selectedText}${b.isCorrect ? " (Correct)" : ""}`, { size: 10 });
      if (!b.isCorrect) addText(`Correct answer: ${b.correctText}`, { size: 10 });
      if (b.explanation) addText(b.explanation, { size: 10, color: [110, 110, 110] });
      if (feedback[b.questionIndex]) addText(feedback[b.questionIndex], { size: 10, color: [110, 110, 110] });
      y += 8;
    });

    // Meridian_[Participant_Name]_[Quiz_Name]_Result.pdf, with spaces
    // and anything non-alphanumeric collapsed to underscores so the
    // filename is always safe regardless of what's in either string.
    const safe = (s: string) => s.trim().replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    doc.save(`Meridian_${safe(data.name)}_${safe(data.quizTitle)}_Result.pdf`);
  }

  // Certificate — a separate, dedicated PDF from the results one above,
  // styled as an actual certificate rather than a data report. Every
  // value on it (name, quiz, score, date/time, certificate number) comes
  // from what /api/sessions/:id/certificate already issued and returned
  // — nothing is entered manually, and the date/time is the participant's
  // real completion timestamp, never today's date or the quiz's
  // creation date.
  // Loads a remote image (the uploaded logo) as a data URL jsPDF can
  // actually embed — see src/lib/certificate-pdf.ts, which now owns
  // this and the rest of the certificate's drawing logic, so a preview
  // built from Branding settings can never drift out of sync with what
  // a real participant actually receives.
  async function downloadCertificate() {
    if (!certificate || !data) return;
    const completedDate = data.completedAt ? new Date(data.completedAt) : new Date(certificate.issuedAt);
    const doc = await buildCertificatePdf({
      participantName: certificate.participantName,
      quizTitle: certificate.quizTitle,
      scorePercent: certificate.scorePercent,
      passMarkPercent: data.passMarkPercent,
      completedDate,
      branding: certificate.branding,
      certificateNumber: certificate.certificateNumber,
      verifyUrl: certificate.verifyUrl
    });
    doc.save(`Meridian_Certificate_${safeFilename(certificate.participantName)}_${safeFilename(certificate.quizTitle)}.pdf`);
  }

  if (error) {
    return (
      <main className="min-h-screen flex items-center justify-center px-6 text-center">
        <p className="text-parchment/50">{error}</p>
      </main>
    );
  }
  if (!data) {
    return <main className="min-h-screen flex items-center justify-center text-parchment/50">Loading your results…</main>;
  }

  return (
    <main className="min-h-screen px-6 py-10 flex flex-col items-center">
      <div className="w-full max-w-lg">
        <p className="text-gold text-xs tracking-[0.2em] mb-3 text-center">{data.quizTitle.toUpperCase()}</p>
        <p className="font-display italic text-2xl text-center mb-4">Nice work, {data.name}</p>

        <div className="flex flex-col items-center gap-2 mb-8 no-print">
          <button
            onClick={downloadPdf}
            disabled={aiLoading}
            className="btn-ghost text-sm px-5 py-2.5 disabled:opacity-50"
          >
            {aiLoading ? "Preparing your analysis…" : "Download my results (PDF)"}
          </button>
          {aiLoading && <p className="text-xs text-parchment/40">Your AI analysis is still being written — this only takes a few seconds.</p>}
        </div>

        <div className="case-panel p-8 text-center mb-6">
          <p className="field-label mb-2">Base Score</p>
          <div className="flex items-center justify-center mb-5">
            <ScoreCircle correct={data.breakdown.filter((b) => b.isCorrect).length} total={data.breakdown.length} />
          </div>

          <p className="field-label mb-2">Score</p>
          <p className="font-dial text-5xl text-gold mb-6">{data.percentage}%</p>

          {data.profile && (
            <p className="text-parchment/50 text-sm mb-6">
              <span className="text-gold font-medium">{data.profile.xpTotal} XP</span> total ·{" "}
              {data.profile.quizzesCompleted} quiz{data.profile.quizzesCompleted !== 1 ? "zes" : ""} completed
            </p>
          )}

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm text-left border-t border-hairline pt-6">
            <div>
              <p className="field-label mb-1">Correct answers</p>
              <p className="font-dial text-lg">{data.breakdown.filter((b) => b.isCorrect).length}</p>
            </div>
            <div>
              <p className="field-label mb-1">Incorrect answers</p>
              <p className="font-dial text-lg">{data.breakdown.filter((b) => !b.isCorrect).length}</p>
            </div>
            <div>
              <p className="field-label mb-1">Total questions</p>
              <p className="font-dial text-lg">{data.breakdown.length}</p>
            </div>
            <div>
              <p className="field-label mb-1">Pass mark</p>
              <p className="font-dial text-lg">{data.passMarkPercent}%</p>
            </div>
            <div>
              <p className="field-label mb-1">Points (with bonus)</p>
              <p className="font-dial text-lg">{data.totalScore}</p>
            </div>
            <div>
              <p className="field-label mb-1">Your rank</p>
              <p className="font-dial text-lg">{rank ? `#${rank}` : "—"}</p>
            </div>
            <div>
              <p className="field-label mb-1">Time</p>
              <p className="font-dial text-lg">{formatTime(data.timeSeconds)}</p>
            </div>
          </div>
          <p className={`mt-6 text-base font-semibold ${data.passed ? "text-gold" : "text-crimson"}`}>
            {data.passed ? "PASSED" : "NOT PASSED"}
          </p>
        </div>

        {certificate && (
          <div className="case-panel p-6 mb-6 text-center border-gold/40">
            <p className="font-display italic text-xl text-gold mb-1">Certificate of Achievement</p>
            <p className="text-parchment/60 text-sm mb-1">Certificate Issued</p>
            <p className="text-parchment/30 text-xs mb-4 font-dial">{certificate.certificateNumber}</p>
            <button onClick={downloadCertificate} className="btn-gold text-sm px-5 py-2.5">
              Download Certificate
            </button>
          </div>
        )}

        {data.speedBonus > 0 && (
          <div className="case-panel p-5 mb-6 text-sm flex justify-between">
            <span className="text-parchment/50">Base score</span>
            <span>{data.baseScore}</span>
          </div>
        )}
        {data.speedBonus > 0 && (
          <div className="case-panel p-5 mb-6 text-sm flex justify-between -mt-6 border-t-0">
            <span className="text-parchment/50">Speed bonus</span>
            <span>{data.speedBonus}</span>
          </div>
        )}

        {profile && (
          <div className="case-panel p-6 mb-6">
            <p className="field-label mb-4">{data.name ? `${data.name}\u2019s Learning Profile` : "Your Learning Profile"}</p>
            {profile.summary && <p className="text-sm text-parchment/80 leading-relaxed mb-4">{profile.summary}</p>}
            {profile.strong.length > 0 && (
              <p className="text-sm mb-2">
                <span className="text-gold">Strong categories: </span>
                {profile.strong.join(", ")}
              </p>
            )}
            {profile.improve.length > 0 && (
              <p className="text-sm mb-3">
                <span className="text-crimson/80">Categories to improve: </span>
                {profile.improve.join(", ")}
              </p>
            )}
            {profile.focusTopics && profile.focusTopics.length > 0 && (
              <div className="mb-3">
                <p className="text-sm text-gold mb-1">Concentrate on these topics next:</p>
                <ul className="list-disc list-inside text-sm text-parchment/70">
                  {profile.focusTopics.map((topic) => (
                    <li key={topic}>{topic}</li>
                  ))}
                </ul>
              </div>
            )}
            {profile.recommendation && <p className="text-sm text-parchment/60">{profile.recommendation}</p>}
          </div>
        )}

        {/* Self vs. own history (if this quiz collects mobile/email and a
            previous attempt exists) or self vs. the pass mark otherwise —
            deliberately never self vs. the group here. A peer comparison
            is motivating for whoever's above average and discouraging for
            everyone below it; growth against your OWN past attempt, or
            against a flat target, stays encouraging either way. The
            group-average comparison still exists — just admin-only, on
            the presenter dashboard, where no one's being compared in
            front of anyone else. */}
        {/* Skipped entirely for a participation quiz (pass mark 0%) — no
            evaluation, self-vs-history or otherwise, for a quiz that was
            never about clearing a bar in the first place. */}
        {data.passMarkPercent > 0 && data.categoryBreakdown && data.categoryBreakdown.length >= 3 && (
          <div className="case-panel p-6 mb-6 flex flex-col items-center">
            <p className="field-label mb-1">{data.previousAttempt ? "Your progress" : "Your knowledge shape"}</p>
            <p className="text-parchment/40 text-xs mb-4 text-center">
              {data.previousAttempt
                ? `Compared with your attempt on ${new Date(data.previousAttempt.completedAt).toLocaleDateString()}`
                : "Compared with the pass mark for this quiz"}
            </p>
            <RadarChart
              categories={data.categoryBreakdown.map((c) => ({ label: c.category, value: Math.round((c.correct / c.total) * 100) }))}
              comparisonValues={
                data.previousAttempt
                  ? data.categoryBreakdown.map((c) => {
                      const match = data.previousAttempt!.categoryBreakdown.find((p) => p.category === c.category);
                      return match ? Math.round((match.correct / match.total) * 100) : 0;
                    })
                  : data.categoryBreakdown.map(() => data.passMarkPercent)
              }
              comparisonLabel={data.previousAttempt ? "Last attempt" : "Pass mark"}
            />
          </div>
        )}

        {/* Visual percentage breakdown — the actual numbers behind the AI
            profile above, not just its summary of them. Sorted weakest
            first so the thing most worth studying is the first thing
            seen. */}
        {data.categoryBreakdown && data.categoryBreakdown.length > 0 && (
          <div className="case-panel p-6 mb-6">
            <p className="field-label mb-4">Knowledge by category</p>
            <div className="flex flex-col gap-3">
              {[...data.categoryBreakdown]
                .sort((a, b) => a.correct / a.total - b.correct / b.total)
                .map((c) => {
                  const pct = Math.round((c.correct / c.total) * 100);
                  return (
                    <div key={c.category}>
                      <div className="flex justify-between text-sm mb-1">
                        <span>{c.category}</span>
                        <span className="font-dial text-parchment/60">
                          {c.correct}/{c.total} · {pct}%
                        </span>
                      </div>
                      <div className="h-1.5 bg-hairline overflow-hidden">
                        <div className={`h-full ${pct >= 70 ? "bg-gold" : pct >= 40 ? "bg-parchment/50" : "bg-crimson"}`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        {data.topicBreakdown && data.topicBreakdown.length > 0 && (
          <div className="case-panel p-6 mb-6">
            <p className="field-label mb-4">Knowledge by topic</p>
            <div className="flex flex-col gap-3">
              {[...data.topicBreakdown]
                .sort((a, b) => a.correct / a.total - b.correct / b.total)
                .map((t) => {
                  const pct = Math.round((t.correct / t.total) * 100);
                  return (
                    <div key={t.topic}>
                      <div className="flex justify-between text-sm mb-1">
                        <span>{t.topic}</span>
                        <span className="font-dial text-parchment/60">
                          {t.correct}/{t.total} · {pct}%
                        </span>
                      </div>
                      <div className="h-1.5 bg-hairline overflow-hidden">
                        <div className={`h-full ${pct >= 70 ? "bg-gold" : pct >= 40 ? "bg-parchment/50" : "bg-crimson"}`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        <p className="field-label mb-4">Question review</p>
        <div className="flex flex-col gap-4">
          {data.breakdown.map((b) => (
            <div key={b.questionIndex} className="case-panel p-5">
              <div className="flex justify-between items-start mb-2">
                <p className="text-sm font-medium pr-4">{b.questionText}</p>
                <span className={`text-xs shrink-0 font-semibold ${b.isCorrect ? "text-gold" : "text-crimson"}`}>
                  {b.isCorrect ? "Correct" : "Incorrect"}
                </span>
              </div>
              {!b.isCorrect && (
                <p className="text-xs text-parchment/50 mb-1">
                  You answered <span className="text-ivory">{b.selectedText}</span> — correct answer was{" "}
                  <span className="text-gold">{b.correctText}</span>
                </p>
              )}
              {b.explanation && <p className="text-xs text-parchment/40 mb-2">{b.explanation}</p>}
              {!b.isCorrect && feedback[b.questionIndex] && (
                <p className="text-xs text-parchment/70 border-t border-hairline pt-2 mt-2">{feedback[b.questionIndex]}</p>
              )}
              <p className="text-xs text-parchment/30 mt-2">+{b.questionScore} pts</p>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
