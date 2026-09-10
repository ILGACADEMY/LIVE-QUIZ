"use client";

import { useState } from "react";
import { EditableQuestion } from "@/components/admin/QuestionEditor";
import { parseQuestionsFromText, QUESTION_IMPORT_TEMPLATE } from "@/lib/question-import";

export default function ImportQuestionsModal({
  remainingSlots,
  onImport,
  onClose
}: {
  remainingSlots: number;
  onImport: (questions: EditableQuestion[]) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const [parsed, setParsed] = useState<EditableQuestion[] | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  function downloadTemplate() {
    const blob = new Blob([QUESTION_IMPORT_TEMPLATE], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "question-import-template.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleParse() {
    const result = parseQuestionsFromText(text);
    setParsed(result.questions);
    setWarnings(result.warnings);
  }

  return (
    <div className="fixed inset-0 z-50 bg-charcoal/95 flex items-center justify-center p-6">
      <div className="case-panel w-full max-w-2xl max-h-[85vh] overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-4">
          <p className="font-display italic text-xl">Import questions from Word</p>
          <button onClick={onClose} className="text-parchment/50 hover:text-gold text-sm">
            Close
          </button>
        </div>

        {!parsed && (
          <>
            <ol className="text-sm text-parchment/60 mb-4 list-decimal list-inside space-y-1">
              <li>
                <button onClick={downloadTemplate} className="text-gold hover:underline">
                  Download the template
                </button>{" "}
                and open it in Word.
              </li>
              <li>Fill it in with your own questions, keeping the same layout (one blank line between questions).</li>
              <li>Select all the text in Word, copy it, and paste it into the box below.</li>
            </ol>

            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={12}
              className="field-input font-mono text-xs mb-4"
              placeholder={"Q: What is the primary function of a balance wheel?\nA) Store energy\nB) Regulate timekeeping\nC) Display the date\nD) Waterproof the case\nCorrect: B\nExplanation: ...\nCategory: Movements\nDifficulty: Medium\nTopic: Balance wheel function"}
            />

            <button onClick={handleParse} disabled={!text.trim()} className="btn-gold">
              Preview questions
            </button>
          </>
        )}

        {parsed && (
          <>
            <p className="text-sm mb-3">
              Found <span className="text-gold">{parsed.length}</span> question{parsed.length !== 1 ? "s" : ""}
              {remainingSlots < parsed.length && (
                <span className="text-crimson">
                  {" "}
                  — only {remainingSlots} more will fit (50-question limit); the rest will be left out.
                </span>
              )}
            </p>

            {warnings.length > 0 && (
              <div className="case-panel p-4 mb-4 border-crimson/40">
                <p className="text-crimson text-sm font-medium mb-2">Check these before adding:</p>
                <ul className="text-xs text-parchment/60 list-disc list-inside space-y-1">
                  {warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="case-panel divide-y divide-hairline mb-4 max-h-64 overflow-y-auto">
              {parsed.map((q, i) => (
                <div key={i} className="p-3 text-sm">
                  <p className="text-parchment/40 text-xs mb-1">Q{i + 1}</p>
                  <p className="mb-1">{q.question_text || "(no question text found)"}</p>
                  <p className="text-parchment/50 text-xs">
                    Correct: {q.correct_option} · {q.option_a ? "4 options found" : "options may be incomplete"}
                  </p>
                </div>
              ))}
              {parsed.length === 0 && <p className="p-4 text-parchment/40 text-sm">No questions found — check the format and try again.</p>}
            </div>

            <div className="flex gap-3">
              <button onClick={() => setParsed(null)} className="btn-ghost">
                Back to editing
              </button>
              <button onClick={() => onImport(parsed)} disabled={parsed.length === 0} className="btn-gold">
                Add {Math.min(parsed.length, remainingSlots)} question{Math.min(parsed.length, remainingSlots) !== 1 ? "s" : ""} to this quiz
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
