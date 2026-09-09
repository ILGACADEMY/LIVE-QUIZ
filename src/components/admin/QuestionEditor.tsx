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
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  function set<K extends keyof EditableQuestion>(key: K, value: EditableQuestion[K]) {
    onChange({ ...question, [key]: value });
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

      <label className="field-label block mb-2">Question</label>
      <textarea
        value={question.question_text}
        onChange={(e) => set("question_text", e.target.value)}
        rows={2}
        className="field-input mb-4"
        placeholder="e.g. Which material is used for the VR34B's caseback gasket?"
      />

      <label className="field-label block mb-2">Image or video (optional)</label>
      <div className="flex items-center gap-4 mb-2">
        {question.image_url && question.media_type === "video" ? (
          <video
            src={question.image_url}
            controls
            className="w-32 h-20 object-cover border border-hairline bg-black"
          />
        ) : question.image_url ? (
          <img src={question.image_url} alt="" className="w-20 h-20 object-cover border border-hairline" />
        ) : null}
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
        {question.image_url && (
          <button
            type="button"
            onClick={() => {
              set("image_url", null);
              set("media_type", "image");
            }}
            className="text-xs text-crimson/80 hover:text-crimson"
          >
            Remove
          </button>
        )}
      </div>
      {uploadError && (
        <p className="text-xs text-crimson mb-3">{uploadError}</p>
      )}
      <p className="text-xs text-parchment/50 mb-5">
        Images up to 5MB (JPG/PNG/WEBP). Videos up to 50MB (MP4/WEBM/MOV) — plays with sound on the participant's device, same as any video player.
      </p>

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
