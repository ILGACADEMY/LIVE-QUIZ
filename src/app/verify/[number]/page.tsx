"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import MeridianWordmark from "@/components/shared/MeridianWordmark";

interface VerifyResult {
  found: boolean;
  certificateNumber?: string;
  quizTitle?: string;
  participantName?: string;
  scorePercent?: number;
  issuedAt?: string;
}

export default function VerifyCertificatePage() {
  const params = useParams();
  const number = decodeURIComponent(String(params.number ?? ""));
  const [result, setResult] = useState<VerifyResult | null>(null);

  useEffect(() => {
    fetch(`/api/certificates/verify/${encodeURIComponent(number)}`)
      .then((r) => r.json())
      .then(setResult)
      .catch(() => setResult({ found: false }));
  }, [number]);

  return (
    <main className="min-h-screen flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-md text-center">
        <div className="mb-10 flex justify-center">
          <MeridianWordmark size="small" />
        </div>

        {result === null && <p className="text-parchment/50">Checking…</p>}

        {result && !result.found && (
          <div className="case-panel p-8">
            <p className="text-3xl mb-3">✕</p>
            <p className="font-display text-xl italic mb-2">No certificate found</p>
            <p className="text-parchment/50 text-sm">
              We couldn't find a certificate matching <span className="text-parchment/70">{number}</span>. Double-check the
              certificate number, or the QR code it came from.
            </p>
          </div>
        )}

        {result && result.found && (
          <div className="case-panel p-8">
            <p className="text-3xl mb-3 text-gold">✓</p>
            <p className="font-display text-xl italic mb-1">Certificate verified</p>
            <p className="text-parchment/40 text-xs mb-6">This is a genuine Meridian certificate.</p>

            <div className="text-left space-y-3 border-t border-hairline pt-5">
              <div>
                <p className="text-parchment/40 text-xs tracking-wide">RECIPIENT</p>
                <p className="text-ivory">{result.participantName}</p>
              </div>
              <div>
                <p className="text-parchment/40 text-xs tracking-wide">QUIZ</p>
                <p className="text-ivory">{result.quizTitle}</p>
              </div>
              <div>
                <p className="text-parchment/40 text-xs tracking-wide">SCORE</p>
                <p className="text-ivory">{result.scorePercent}%</p>
              </div>
              <div>
                <p className="text-parchment/40 text-xs tracking-wide">ISSUED</p>
                <p className="text-ivory">
                  {result.issuedAt &&
                    new Date(result.issuedAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
                </p>
              </div>
              <div>
                <p className="text-parchment/40 text-xs tracking-wide">CERTIFICATE ID</p>
                <p className="text-ivory font-mono text-sm">{result.certificateNumber}</p>
              </div>
            </div>

            <p className="text-parchment/30 text-xs mt-6">
              If any detail here doesn't match what's printed on the certificate itself, treat that certificate as invalid.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
