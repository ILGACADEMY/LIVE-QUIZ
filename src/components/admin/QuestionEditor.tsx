"use client";

import { useRef, useState } from "react";
import { OptionKey, Difficulty } from "@/lib/types";
import { supabaseBrowser } from "@/lib/supabase/client";

export interface EditableQuestion {
  id?: string;
  question_text: string;
  image_url: string | null;
  media_type: "image" | "video"; // NEW — defaults to 'image' for existing rows via migration
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_option: OptionKey;
  explanation: string;
  wrong_feedback_a: string;
  wrong_feedback_b: string;
  wrong_feedback_c: string;
  wrong_feedback_d: string;
  category: string;
  difficulty: Difficulty;
  learning_topic: string;
}

export function blankQuestion(): EditableQuestion {
  return {
    question_text: "",
    image_url: null,
    media_type: "image",
    option_a: "",
    option_b: "",
    option_c: "",
    option_d: "",
    correct_option: "A",
    explanation: "",
    wrong_feedback_a: "",
    wrong_feedback_b: "",
    wrong_feedback_c: "",
    wrong_feedback_d: "",
    category: "",
    difficulty: "medium",
    learning_topic: ""
  };
}

const OPTIONS: { key: OptionKey; field: keyof EditableQuestion; feedbackField: keyof EditableQuestion }[] = [
  { key: "A", field: "option_a", feedbackField: "wrong_feedback_a" },
  { key: "B", field: "option_b", feedbackField: "wrong_feedback_b" },
  { key: "C", field: "option_c", feedbackField: "wrong_feedback_c" },
  { key: "D", field: "option_d", feedbackField: "wrong_feedback_d" }
];

export default function QuestionEditor({
  index,
  total,
  question,
  onChange,
  onDuplicate,
  onDelete,
  onMoveUp,
  onMoveDown,
  advancedMode = true
}: {
  index: number;
  total: number;
  question: EditableQuestion;
  onChange: (q: EditableQuestion) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  advancedMode?: boolean;
}) {
  const [uploading, setUploading] = useState(false);
  const [spellChecking, setSpellChecking] = useState(false);
  const [spellCorrections, setSpellCorrections] = useState<
    { field: "questionText" | "optionA" | "optionB" | "optionC" | "optionD" | "explanation"; original: string; corrected: string }[] | null
  >(null);
  const [spellError, setSpellError] = useState<string | null>(null);
  const [suggestingFeedback, setSuggestingFeedback] = useState<Record<string, boolean>>({});
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  function set<K extends keyof EditableQuestion>(key: K, value: EditableQuestion[K]) {
    onChange({ ...question, [key]: value });
  }

  // Maps the AI route's field names to this question's actual state keys.
  const FIELD_KEY: Record<string, keyof EditableQuestion> = {
    questionText: "question_text",
    optionA: "option_a",
    optionB: "option_b",
    optionC: "option_c",
    optionD: "option_d",
    explanation: "explanation"
  };
  const FIELD_LABEL: Record<string, string> = {
    questionText: "Question",
    optionA: "Answer A",
    optionB: "Answer B",
    optionC: "Answer C",
    optionD: "Answer D",
    explanation: "Explanation"
  };

  async function checkSpelling() {
    setSpellChecking(true);
    setSpellError(null);
    setSpellCorrections(null);
    try {
      const res = await fetch("/api/ai/check-spelling", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionText: question.question_text,
          optionA: question.option_a,
          optionB: question.option_b,
          optionC: question.option_c,
          optionD: question.option_d,
          explanation: question.explanation
        })
      });
      const data = await res.json();
      if (!res.ok) {
        setSpellError(data.error ?? "Could not check spelling.");
        return;
      }
      setSpellCorrections(data.corrections ?? []);
    } catch {
      setSpellError("Network error — the check never reached the server.");
    } finally {
      setSpellChecking(false);
    }
  }

  function applyCorrection(index: number) {
    if (!spellCorrections) return;
    const correction = spellCorrections[index];
    set(FIELD_KEY[correction.field], correction.corrected);
    setSpellCorrections(spellCorrections.filter((_, i) => i !== index));
  }

  function applyAllCorrections() {
    if (!spellCorrections) return;
    let next = { ...question };
    spellCorrections.forEach((c) => {
      next = { ...next, [FIELD_KEY[c.field]]: c.corrected };
    });
    onChange(next);
    setSpellCorrections([]);
  }

  async function suggestFeedbackFor(optionKey: OptionKey, optionField: keyof EditableQuestion, feedbackField: keyof EditableQuestion) {
    const correctField = OPTIONS.find((o) => o.key === question.correct_option)?.field;
    const correctText = correctField ? (question[correctField] as string) : "";
    const wrongOptionText = question[optionField] as string;
    if (!question.question_text || !correctText || !wrongOptionText) return;

    setSuggestingFeedback((s) => ({ ...s, [optionKey]: true }));
    try {
      const res = await fetch("/api/ai/suggest-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionText: question.question_text,
          correctText,
          wrongOptionText,
          explanation: question.explanation
        })
      });
      const data = await res.json();
      if (res.ok && data.suggestion) {
        set(feedbackField, data.suggestion as never);
      }
    } catch {
      // Silent — this is a convenience suggestion, not a required action; leaving the field as-is on failure is fine.
    } finally {
      setSuggestingFeedback((s) => ({ ...s, [optionKey]: false }));
    }
  }

  const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
  const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

  async function handleUpload(file: File) {
    setUploading(true);
    setUploadError(null);
    try {
      const isVideo = file.type.startsWith("video/");
      const maxBytes = isVideo ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
      if (file.size > maxBytes) {
        setUploadError(`${isVideo ? "Video" : "Image"} must be under ${maxBytes / (1024 * 1024)}MB.`);
        return;
      }

      // Step 1: ask our server for a one-time signed upload token (a tiny
      // JSON request — no file bytes involved, so this part never hits
      // any body-size limit).
      const signRes = await fetch("/api/upload/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: file.name, fileType: file.type })
      });
      const signData = await signRes.json();
      if (!signRes.ok) {
        setUploadError(signData.error ?? "Could not prepare the upload.");
        return;
      }

      // Step 2: send the actual file bytes DIRECTLY to Supabase Storage
      // using that token — this never passes through our own server, so
      // Vercel's ~4.5MB serverless request-body limit never applies here,
      // no matter how large the video is (up to our own 50MB check above).
      const { error: storageError } = await supabaseBrowser.storage
        .from("quiz-images")
        .uploadToSignedUrl(signData.path, signData.token, file);
      if (storageError) {
        setUploadError(`Upload failed: ${storageError.message}`);
        return;
      }

      set("image_url", signData.publicUrl);
      set("media_type", signData.mediaType ?? (isVideo ? "video" : "image"));
    } catch {
      setUploadError("Network error — the upload never reached the server. Check your connection and try again.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="case-panel p-6">
      <div className="flex items-center justify-between mb-5">
        <p className="font-display italic text-lg text-gold">
          Question {String(index + 1).padStart(2, "0")}
        </p>
        <div className="flex gap-3 text-xs text-parchment/60">
          <button onClick={onMoveUp} disabled={index === 0} className="hover:text-gold disabled:opacity-30">
            ▲ Move up
          </button>
          <button onClick={onMoveDown} disabled={index === total - 1} className="hover:text-gold disabled:opacity-30">
            ▼ Move down
          </button>
          <button onClick={onDuplicate} className="hover:text-gold">
            Duplicate
          </button>
          <button onClick={onDelete} className="hover:text-crimson">
            Delete
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between mb-2">
        <label className="field-label">Question</label>
        <button
          type="button"
          onClick={checkSpelling}
          disabled={spellChecking}
          className="text-xs text-parchment/50 hover:text-gold flex items-center gap-1"
          title="Checks question text, answers, and explanation for genuine spelling errors — brand names and horology terms are left alone"
        >
          {spellChecking ? "Checking spelling…" : "✓ Check spelling"}
        </button>
      </div>
      {spellError && <p className="text-crimson text-xs mb-2">{spellError}</p>}
      {spellCorrections && (
        <div className="case-panel p-4 mb-4">
          {spellCorrections.length === 0 ? (
            <p className="text-parchment/50 text-sm">No spelling issues found.</p>
          ) : (
            <>
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm text-parchment/70">
                  {spellCorrections.length} possible issue{spellCorrections.length !== 1 ? "s" : ""} found
                </p>
                <button type="button" onClick={applyAllCorrections} className="btn-ghost text-xs px-3 py-1.5">
                  Apply all
                </button>
              </div>
              <div className="flex flex-col gap-3">
                {spellCorrections.map((c, i) => (
                  <div key={i} className="text-sm border-t border-hairline pt-3 first:border-t-0 first:pt-0">
                    <p className="text-parchment/40 text-xs mb-1">{FIELD_LABEL[c.field]}</p>
                    <p className="text-crimson/70 line-through mb-0.5">{c.original}</p>
                    <p className="text-gold mb-2">{c.corrected}</p>
                    <button type="button" onClick={() => applyCorrection(i)} className="btn-ghost text-xs px-3 py-1">
                      Apply this one
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
      <textarea
        value={question.question_text}
        onChange={(e) => set("question_text", e.target.value)}
        rows={2}
        className="field-input mb-4"
        placeholder="e.g. Which material is used for the VR34B's caseback gasket?"
      />

      {advancedMode && (
        <>
          <label className="field-label block mb-2">Image or video (optional)</label>
          <div className="flex items-start gap-4 mb-2">
            {/* Always-visible box, even before anything's uploaded — so
                there's a clear, persistent reference point rather than
                nothing at all, which made it hard to tell whether an
                upload had actually gone through. */}
            <div className="w-40 h-40 border border-hairline flex items-center justify-center shrink-0 bg-black/20 relative">
              {question.image_url && question.media_type === "video" ? (
                <video src={question.image_url} controls className="w-full h-full object-cover bg-black" />
              ) : question.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={question.image_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <p className="text-parchment/30 text-xs text-center px-2">No image or video yet</p>
              )}
              {question.image_url && (
                <span className="absolute top-1.5 right-1.5 bg-charcoal/90 text-gold text-[10px] px-1.5 py-0.5 border border-gold/40">
                  ✓ Uploaded
                </span>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <input
                ref={fileInput}
                type="file"
                accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])}
              />
              <button type="button" onClick={() => fileInput.current?.click()} disabled={uploading} className="btn-ghost px-4 py-2 text-sm">
                {uploading ? "Uploading…" : question.image_url ? "Replace media" : "+ Upload image or video"}
              </button>
              <p className="text-parchment/30 text-xs max-w-[220px]">
                Shown to participants above the answer options while this question is live, and on the presenter's
                screen in presentation mode.
              </p>
              {question.image_url && (
                <button
                  type="button"
                  onClick={() => {
                    set("image_url", null);
                    set("media_type", "image");
                  }}
                  className="text-xs text-crimson/80 hover:text-crimson text-left"
                >
                  Remove
                </button>
              )}
            </div>
          </div>
          {uploadError && (
            <p className="text-xs text-crimson mb-3">{uploadError}</p>
          )}
          <p className="text-xs text-parchment/50 mb-5">
            Images up to 5MB (JPG/PNG/WEBP). Videos up to 50MB (MP4/WEBM/MOV) — plays with sound on the participant's device, same as any video player.
          </p>
        </>
      )}

      <div className="grid md:grid-cols-2 gap-4 mb-5">
        {OPTIONS.map(({ key, field }) => (
          <div key={key}>
            <label className="field-label block mb-2">Answer {key}</label>
            <input
              value={question[field] as string}
              onChange={(e) => set(field, e.target.value as never)}
              className="field-input"
            />
          </div>
        ))}
      </div>

      <label className="field-label block mb-2">Correct answer</label>
      <div className="flex gap-2 mb-5">
        {OPTIONS.map(({ key }) => (
          <button
            key={key}
            type="button"
            onClick={() => set("correct_option", key)}
            className={`w-11 h-11 font-body font-semibold border transition-colors ${
              question.correct_option === key
                ? "bg-gold text-charcoal border-gold"
                : "border-hairline text-parchment/60 hover:border-gold"
            }`}
          >
            {key}
          </button>
        ))}
      </div>

      <label className="field-label block mb-2">Correct answer explanation</label>
      <textarea
        value={question.explanation}
        onChange={(e) => set("explanation", e.target.value)}
        rows={2}
        className="field-input mb-5"
        placeholder="Shown on the results screen, and used as the source of truth for AI feedback."
      />

      {advancedMode && (
        <>
          <details className="mb-5">
        <summary className="field-label cursor-pointer mb-3">Wrong-answer feedback (optional, per option)</summary>
        <div className="grid md:grid-cols-2 gap-4 mt-3">
          {OPTIONS.map(({ key, field, feedbackField }) => (
            <div key={key}>
              <div className="flex items-center justify-between mb-2">
                <label className="field-label">If they picked {key}</label>
                {key !== question.correct_option && (
                  <button
                    type="button"
                    onClick={() => suggestFeedbackFor(key, field, feedbackField)}
                    disabled={suggestingFeedback[key] || !question.question_text || !question[field]}
                    className="text-xs text-parchment/40 hover:text-gold disabled:opacity-40"
                    title="AI drafts a short, easy-to-understand explanation of why this answer is wrong — review and edit before saving"
                  >
                    {suggestingFeedback[key] ? "Thinking…" : "✨ AI suggest"}
                  </button>
                )}
              </div>
              <input
                value={question[feedbackField] as string}
                onChange={(e) => set(feedbackField, e.target.value as never)}
                className="field-input"
              />
            </div>
          ))}
        </div>
      </details>

      <div className="grid md:grid-cols-3 gap-4">
        <div>
          <label className="field-label block mb-2">Category</label>
          <input value={question.category} onChange={(e) => set("category", e.target.value)} className="field-input" placeholder="e.g. Movements" />
        </div>
        <div>
          <label className="field-label block mb-2">Difficulty</label>
          <select
            value={question.difficulty}
            onChange={(e) => set("difficulty", e.target.value as Difficulty)}
            className="field-input"
          >
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
        </div>
        <div>
          <label className="field-label block mb-2">Learning topic</label>
          <input
            value={question.learning_topic}
            onChange={(e) => set("learning_topic", e.target.value)}
            className="field-input"
            placeholder="e.g. Chronograph engines"
          />
        </div>
          </div>
        </>
      )}
    </div>
  );
}
