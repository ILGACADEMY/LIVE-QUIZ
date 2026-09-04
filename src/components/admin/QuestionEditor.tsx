"use client";

import { useRef, useState } from "react";
import { OptionKey, Difficulty } from "@/lib/types";

export interface EditableQuestion {
  id?: string;
  question_text: string;
  image_url: string | null;
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
  onMoveDown
}: {
  index: number;
  total: number;
  question: EditableQuestion;
  onChange: (q: EditableQuestion) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  function set<K extends keyof EditableQuestion>(key: K, value: EditableQuestion[K]) {
    onChange({ ...question, [key]: value });
  }

  async function handleUpload(file: File) {
    setUploading(true);
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/upload", { method: "POST", body: form });
    setUploading(false);
    if (res.ok) {
      const { url } = await res.json();
      set("image_url", url);
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

      <label className="field-label block mb-2">Question</label>
      <textarea
        value={question.question_text}
        onChange={(e) => set("question_text", e.target.value)}
        rows={2}
        className="field-input mb-4"
        placeholder="e.g. Which material is used for the VR34B's caseback gasket?"
      />

      <label className="field-label block mb-2">Image (optional)</label>
      <div className="flex items-center gap-4 mb-5">
        {question.image_url && (
          <img src={question.image_url} alt="" className="w-20 h-20 object-cover border border-hairline" />
        )}
        <input
          ref={fileInput}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])}
        />
        <button type="button" onClick={() => fileInput.current?.click()} disabled={uploading} className="btn-ghost px-4 py-2 text-sm">
          {uploading ? "Uploading…" : question.image_url ? "Replace image" : "+ Upload image"}
        </button>
        {question.image_url && (
          <button type="button" onClick={() => set("image_url", null)} className="text-xs text-crimson/80 hover:text-crimson">
            Remove
          </button>
        )}
      </div>

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

      <details className="mb-5">
        <summary className="field-label cursor-pointer mb-3">Wrong-answer feedback (optional, per option)</summary>
        <div className="grid md:grid-cols-2 gap-4 mt-3">
          {OPTIONS.map(({ key, feedbackField }) => (
            <div key={key}>
              <label className="field-label block mb-2">If they picked {key}</label>
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
    </div>
  );
}
