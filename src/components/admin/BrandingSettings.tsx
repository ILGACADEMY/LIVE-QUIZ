"use client";

import { useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

export default function BrandingSettings() {
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [orgName, setOrgName] = useState("ILG ACADEMY");
  const [orgSubtitle, setOrgSubtitle] = useState("TRAINING & DEVELOPMENT");
  const [orgSaved, setOrgSaved] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/admin/branding")
      .then((r) => r.json())
      .then((data) => {
        setLogoUrl(data.logoUrl ?? null);
        setOrgName(data.certificateOrgName ?? "ILG ACADEMY");
        setOrgSubtitle(data.certificateOrgSubtitle ?? "TRAINING & DEVELOPMENT");
      })
      .catch(() => {});
  }, []);

  async function saveOrgText() {
    setError(null);
    const res = await fetch("/api/admin/branding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ certificateOrgName: orgName, certificateOrgSubtitle: orgSubtitle })
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Could not save.");
      return;
    }
    setOrgSaved(true);
  }

  async function handleUpload(file: File) {
    setLoading(true);
    setError(null);
    try {
      if (!["image/jpeg", "image/jpg", "image/png", "image/webp"].includes(file.type)) {
        setError("Logo must be a JPG, PNG, or WEBP image.");
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        setError("Logo must be under 5MB.");
        return;
      }

      // Same signed-upload pattern as question images — the file goes
      // straight to Supabase Storage, never through our own server, so
      // there's no size-limit concern here either.
      const signRes = await fetch("/api/upload/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: file.name, fileType: file.type })
      });
      const signData = await signRes.json();
      if (!signRes.ok) {
        setError(signData.error ?? "Could not prepare the upload.");
        return;
      }

      const { error: storageError } = await supabaseBrowser.storage.from("quiz-images").uploadToSignedUrl(signData.path, signData.token, file);
      if (storageError) {
        setError(`Upload failed: ${storageError.message}`);
        return;
      }

      const saveRes = await fetch("/api/admin/branding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logoUrl: signData.publicUrl })
      });
      if (!saveRes.ok) {
        const data = await saveRes.json().catch(() => ({}));
        setError(data.error ?? "Uploaded, but could not save it as the site logo.");
        return;
      }

      setLogoUrl(signData.publicUrl);
    } catch {
      setError("Network error — the upload never reached the server.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="case-panel p-5 mb-8">
      <div className="flex items-center justify-between gap-4 flex-wrap mb-5">
        <div className="flex items-center gap-4">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="Current logo" className="h-10 w-auto object-contain border border-hairline p-1" />
          ) : (
            <div className="h-10 w-10 border border-hairline flex items-center justify-center text-parchment/30 text-xs">
              None
            </div>
          )}
          <div>
            <p className="field-label mb-1">Company logo</p>
            <p className="text-parchment/40 text-xs">
              Shown at the top of every page (join screen, presenter view, results) and on issued certificates.
            </p>
          </div>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])}
        />
        <button onClick={() => fileInput.current?.click()} disabled={loading} className="btn-ghost text-sm px-4 py-2 shrink-0">
          {loading ? "Uploading…" : logoUrl ? "Replace logo" : "Upload logo"}
        </button>
      </div>

      <div className="border-t border-hairline pt-5">
        <p className="field-label mb-1">Certificate wording</p>
        <p className="text-parchment/40 text-xs mb-3">
          The organization name shown at the top of every issued certificate. To customize the achievement sentence
          for a specific quiz's certificate, use that quiz's own Advanced settings instead.
        </p>
        <div className="grid md:grid-cols-2 gap-3">
          <input
            value={orgName}
            onChange={(e) => {
              setOrgName(e.target.value);
              setOrgSaved(false);
            }}
            className="field-input text-sm"
            placeholder="ILG ACADEMY"
          />
          <input
            value={orgSubtitle}
            onChange={(e) => {
              setOrgSubtitle(e.target.value);
              setOrgSaved(false);
            }}
            className="field-input text-sm"
            placeholder="TRAINING & DEVELOPMENT"
          />
        </div>
        {!orgSaved && (
          <button onClick={saveOrgText} className="btn-ghost text-sm px-4 py-2 mt-3">
            Save wording
          </button>
        )}
      </div>

      {error && <p className="text-crimson text-sm mt-4">{error}</p>}
    </div>
  );
}
