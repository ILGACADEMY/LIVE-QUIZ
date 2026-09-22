"use client";

import { useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { buildCertificatePdf } from "@/lib/certificate-pdf";

export default function BrandingSettings() {
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [orgName, setOrgName] = useState("MERIDIAN");
  const [orgSubtitle, setOrgSubtitle] = useState("TRAINING & DEVELOPMENT");
  const [location, setLocation] = useState("");
  const [signerName, setSignerName] = useState("");
  const [textSaved, setTextSaved] = useState(true);
  const [certBg, setCertBg] = useState<string | null>(null);
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [certBgUploading, setCertBgUploading] = useState(false);
  const [signatureUploading, setSignatureUploading] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const certBgInput = useRef<HTMLInputElement>(null);
  const signatureInput = useRef<HTMLInputElement>(null);

  // Builds a sample certificate with your current logo, wording,
  // background, and signature — the exact same drawing code that
  // generates a real one, just fed a placeholder name and score — so
  // you can see how it actually looks before anyone ever receives one.
  // Opens a blank tab FIRST, synchronously, then fills it in once the
  // PDF is ready — building the PDF involves awaiting image loads, and
  // opening a new tab only after an await tends to get silently
  // blocked as a popup by most browsers, so the tab has to already
  // exist before that.
  async function previewCertificate() {
    setPreviewing(true);
    setError(null);
    const win = window.open("", "_blank");
    try {
      const doc = await buildCertificatePdf({
        participantName: "Jane Doe",
        quizTitle: "Sample Quiz",
        scorePercent: 92,
        passMarkPercent: 60,
        completedDate: new Date(),
        branding: {
          orgName,
          orgSubtitle,
          logoUrl,
          message: null,
          brandLogoUrl: null,
          location: location || null,
          backgroundUrl: certBg,
          signerName: signerName || null,
          signatureUrl
        },
        certificateNumber: "MER-SMP-2026-000001",
        verifyUrl: `${window.location.origin}/verify/MER-SMP-2026-000001`
      });
      const blobUrl = doc.output("bloburl");
      if (win) win.location.href = blobUrl.toString();
      else setError("Your browser blocked the preview tab — allow pop-ups for this site and try again.");
    } catch {
      win?.close();
      setError("Could not generate the preview.");
    } finally {
      setPreviewing(false);
    }
  }

  useEffect(() => {
    fetch("/api/admin/branding")
      .then((r) => r.json())
      .then((data) => {
        setLogoUrl(data.logoUrl ?? null);
        setOrgName(data.certificateOrgName ?? "MERIDIAN");
        setOrgSubtitle(data.certificateOrgSubtitle ?? "TRAINING & DEVELOPMENT");
        setLocation(data.certificateLocation ?? "");
        setCertBg(data.certificateBackgroundUrl ?? null);
        setSignerName(data.certificateSignerName ?? "");
        setSignatureUrl(data.certificateSignatureUrl ?? null);
      })
      .catch(() => {});
  }, []);

  async function saveText() {
    setError(null);
    const res = await fetch("/api/admin/branding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        certificateOrgName: orgName,
        certificateOrgSubtitle: orgSubtitle,
        certificateLocation: location,
        certificateSignerName: signerName
      })
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Could not save.");
      return;
    }
    setTextSaved(true);
  }

  async function uploadFile(file: File, kind: "logo" | "certBg" | "signature") {
    const setBusy = kind === "logo" ? setLoading : kind === "certBg" ? setCertBgUploading : setSignatureUploading;
    const label = kind === "logo" ? "Logo" : kind === "certBg" ? "Certificate background" : "Signature image";
    setBusy(true);
    setError(null);
    try {
      if (!["image/jpeg", "image/jpg", "image/png", "image/webp"].includes(file.type)) {
        setError(`${label} must be a JPG, PNG, or WEBP image.`);
        return;
      }
      const maxSize = kind === "certBg" ? 10 : 5;
      if (file.size > maxSize * 1024 * 1024) {
        setError(`${label} must be under ${maxSize}MB.`);
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

      const field = kind === "logo" ? "logoUrl" : kind === "certBg" ? "certificateBackgroundUrl" : "certificateSignatureUrl";
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
      else if (kind === "certBg") setCertBg(signData.publicUrl);
      else setSignatureUrl(signData.publicUrl);
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

  async function removeSignature() {
    setSignatureUploading(true);
    const res = await fetch("/api/admin/branding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ certificateSignatureUrl: "" })
    });
    setSignatureUploading(false);
    if (res.ok) setSignatureUrl(null);
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
          Shown at the top of every issued certificate's built-in layout. To customize the achievement
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
            placeholder="MERIDIAN"
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
          placeholder="Optional location line, e.g. City, Country"
        />
        {!textSaved && (
          <button onClick={saveText} className="btn-ghost text-sm px-4 py-2 mt-3">
            Save wording
          </button>
        )}
      </div>

      <div className="border-t border-hairline pt-5 mb-5">
        <p className="field-label mb-1">Signature</p>
        <p className="text-parchment/40 text-xs mb-3">
          Shown at the bottom right of every issued certificate — your actual handwritten signature (an
          image), with your name printed beneath it. Leave the image unset to show just the printed name with
          no signature above it.
        </p>
        <div className="flex items-center gap-3 flex-wrap mb-3">
          {signatureUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={signatureUrl} alt="Signature" className="h-12 w-auto object-contain border border-hairline bg-white px-2" />
          ) : (
            <div className="h-12 w-24 border border-hairline flex items-center justify-center text-parchment/30 text-xs">
              None set
            </div>
          )}
          <input
            ref={signatureInput}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && uploadFile(e.target.files[0], "signature")}
          />
          <button onClick={() => signatureInput.current?.click()} disabled={signatureUploading} className="btn-ghost text-sm px-4 py-2">
            {signatureUploading ? "Uploading…" : signatureUrl ? "Replace signature" : "Upload signature"}
          </button>
          {signatureUrl && (
            <button onClick={removeSignature} disabled={signatureUploading} className="text-xs text-crimson/80 hover:text-crimson">
              Remove
            </button>
          )}
        </div>
        <input
          value={signerName}
          onChange={(e) => {
            setSignerName(e.target.value);
            setTextSaved(false);
          }}
          className="field-input text-sm"
          placeholder="Printed name below the signature, e.g. Mohamed Dilshad Rahim"
        />
        {!textSaved && (
          <button onClick={saveText} className="btn-ghost text-sm px-4 py-2 mt-3">
            Save
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

      <div className="border-t border-hairline pt-5 flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="field-label mb-1">Preview</p>
          <p className="text-parchment/40 text-xs">
            See how a certificate looks with your current logo, wording, signature, and background — with a
            sample name, before anyone real gets one.
          </p>
        </div>
        <button onClick={previewCertificate} disabled={previewing} className="btn-gold text-sm px-4 py-2 shrink-0">
          {previewing ? "Building preview…" : "Preview certificate"}
        </button>
      </div>

      {error && <p className="text-crimson text-sm mt-4">{error}</p>}
    </div>
  );
}
