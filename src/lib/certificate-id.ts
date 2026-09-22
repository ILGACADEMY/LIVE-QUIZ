import "server-only";
import { supabaseAdmin } from "./supabase/server";

/**
 * "Tsar Bomba" -> "TB", "Ducati" -> "DUC", "Titan" -> "TIT" — a short,
 * readable code derived from the quiz's own title, so the certificate
 * ID itself hints at what it's for at a glance. Multi-word titles use
 * each word's first letter (up to 4); a single word takes its own
 * first few letters instead, since a one-letter code from a single
 * word wouldn't be distinctive.
 */
export function quizCode(title: string): string {
  const words = title
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length >= 2) {
    return words
      .map((w) => w[0])
      .join("")
      .toUpperCase()
      .slice(0, 4);
  }
  const lettersOnly = title.replace(/[^a-zA-Z]/g, "");
  return (lettersOnly.slice(0, 3) || "GEN").toUpperCase();
}

/**
 * MER-TB-2026-000921 — the org, the quiz code, the year, then a
 * globally unique, ever-increasing sequence number (shared across every
 * quiz, so two certificates never collide even if issued the same
 * second). The sequence number is what a verification lookup actually
 * keys on — the rest of the string is for human readability.
 */
export async function generateCertificateNumber(quizTitle: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin.rpc("next_certificate_sequence");
  if (error || data === null || data === undefined) return null;
  const year = new Date().getFullYear();
  const padded = String(data).padStart(6, "0");
  return `MER-${quizCode(quizTitle)}-${year}-${padded}`;
}
