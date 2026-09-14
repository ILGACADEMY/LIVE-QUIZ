"use client";

import { useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

export default function BrandingSettings() {
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [orgName, setOrgName] = useState("ILG ACADEMY");
  const [orgSubtitle, setOrgSubtitle] = useState("TRAINING & DEVELOPMENT");
  const [location, setLocation] = useState("");
  const [textSaved, setTextSaved] = useState(true);
  const [certBg, setCertBg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [certBgUploading, setCertBgUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const certBgInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/admin/branding")
      .then((r) => r.json())
      .then((data) => {
        setLogoUrl(data.logoUrl ?? null);
        setOrgName(data.certificateOrgName ?? "ILG ACADEMY");
        setOrgSubtitle(data.certificateOrgSubtitle ?? "TRAINING & DEVELOPMENT");
        setLocation(data.certificateLocation ?? "");
        setCertBg(data.certificateBackgroundUrl ?? null);
      })
      .catch(() => {});
  }, []);

  async function saveText() {
    setError(null);
    const res = await fetch("/api/admin/branding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ certificateOrgName: orgName, certificateOrgSubtitle: orgSubtitle, certificateLocation: location })
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Could not save.");
      return;
    }
    setTextSaved(true);
  }

  async function uploadFile(file: File, kind: "logo" | "certBg") {
    const setBusy = kind === "logo" ? setLoading : setCertBgUploading;
    setBusy(true);
    setError(null);
    try {
      if (!["image/jpeg", "image/jpg", "image/png", "image/webp"].includes(file.type)) {
        setError(`${kind === "logo" ? "Logo" : "Certificate background"} must be a JPG, PNG, or WEBP image.`);
        return;
      }
      const maxSize = kind === "logo" ? 5 : 10;
      if (file.size > maxSize * 1024 * 1024) {
        setError(`${kind === "logo" ? "Logo" : "Certificate background"} must be under ${maxSize}MB.`);
        return;
      }

      // Same signed-upload pattern used everywhere else — the file goes
      // straight to Supabase Storage, never through our own server.
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

      const field = kind === "logo" ? "logoUrl" : "certificateBackgroundUrl";
      const saveRes = await fetch("/api/admin/branding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: signData.publicUrl })
      });
      if (!saveRes.ok) {
        const data = await saveRes.json().catch(() => ({}));
        setError(data.error ?? "Uploaded, but could not save it.");
        return;
      }

      if (kind === "logo") setLogoUrl(signData.publicUrl);
      else setCertBg(signData.publicUrl);
    } catch {
      setError("Network error — the upload never reached the server.");
    } finally {
      setBusy(false);
    }
  }

  async function removeCertBg() {
    setCertBgUploading(true);
    const res = await fetch("/api/admin/branding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ certificateBackgroundUrl: "" })
    });
    setCertBgUploading(false);
    if (res.ok) setCertBg(null);
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
          onChange={(e) => e.target.files?.[0] && uploadFile(e.target.files[0], "logo")}
        />
        <button onClick={() => fileInput.current?.click()} disabled={loading} className="btn-ghost text-sm px-4 py-2 shrink-0">
          {loading ? "Uploading…" : logoUrl ? "Replace logo" : "Upload logo"}
        </button>
      </div>

      <div className="border-t border-hairline pt-5 mb-5">
        <p className="field-label mb-1">Certificate wording</p>
        <p className="text-parchment/40 text-xs mb-3">
          Shown at the top and bottom of every issued certificate's built-in layout. To customize the achievement
          sentence for a specific quiz's certificate, use that quiz's own Advanced settings instead.
        </p>
        <div className="grid md:grid-cols-2 gap-3 mb-3">
          <input
            value={orgName}
            onChange={(e) => {
              setOrgName(e.target.value);
              setTextSaved(false);
            }}
            className="field-input text-sm"
            placeholder="ILG ACADEMY"
          />
          <input
            value={orgSubtitle}
            onChange={(e) => {
              setOrgSubtitle(e.target.value);
              setTextSaved(false);
            }}
            className="field-input text-sm"
            placeholder="TRAINING & DEVELOPMENT"
          />
        </div>
        <input
          value={location}
          onChange={(e) => {
            setLocation(e.target.value);
            setTextSaved(false);
          }}
          className="field-input text-sm"
          placeholder="Optional location line, e.g. ILG of Switzerland, Möhlin, Aargau Switzerland"
        />
        {!textSaved && (
          <button onClick={saveText} className="btn-ghost text-sm px-4 py-2 mt-3">
            Save wording
          </button>
        )}
      </div>

      <div className="border-t border-hairline pt-5">
        <p className="field-label mb-1">Certificate background (optional)</p>
        <p className="text-parchment/40 text-xs mb-3">
          For an exact custom design (like a certificate made in a design tool) rather than the built-in layout
          above — upload a full-page A4 landscape image (JPG/PNG, ~2000px wide works well) with your fixed design
          elements already in place. The participant's name, the quiz title, the score, and the date are still
          drawn on top automatically. Leave unset to use the built-in layout instead.
        </p>
        <div className="flex items-center gap-3 flex-wrap">
          {certBg ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={certBg} alt="Certificate background" className="h-16 w-auto object-contain border border-hairline" />
          ) : (
            <div className="h-16 w-24 border border-hairline flex items-center justify-center text-parchment/30 text-xs">
              None set
            </div>
          )}
          <input
            ref={certBgInput}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && uploadFile(e.target.files[0], "certBg")}
          />
          <button onClick={() => certBgInput.current?.click()} disabled={certBgUploading} className="btn-ghost text-sm px-4 py-2">
            {certBgUploading ? "Uploading…" : certBg ? "Replace background" : "Upload background"}
          </button>
          {certBg && (
            <button onClick={removeCertBg} disabled={certBgUploading} className="text-xs text-crimson/80 hover:text-crimson">
              Remove — use built-in layout
            </button>
          )}
        </div>
      </div>

      {error && <p className="text-crimson text-sm mt-4">{error}</p>}
    </div>
  );
}
