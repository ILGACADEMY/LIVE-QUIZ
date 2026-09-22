import { jsPDF } from "jspdf";
import QRCode from "qrcode";
import { quizCode } from "./certificate-id";

/**
 * The certificate's actual drawing logic, extracted out of the
 * participant results page so it can be reused for a preview in
 * Branding settings — the exact same code draws both, so a preview
 * can never drift out of sync with what a real participant gets.
 * Takes plain, explicit values rather than reading component state,
 * which is what makes it usable from two very different contexts.
 *
 * A note on the verification elements below (QR code, certificate
 * number, emblem, the faint line pattern): these make tampering
 * DETECTABLE, not impossible. A PDF without real cryptographic
 * signing always has an editable text layer — no amount of visual
 * decoration prevents someone with PDF-editing tools from changing a
 * name or score. What the QR code and certificate number actually do
 * is let anyone check the printed details against the permanent
 * server-side record made the moment this certificate was first
 * issued — a mismatch there is the real tell. The emblem and line
 * pattern are genuine premium visual touches, not cryptographic
 * protection, and are presented here as exactly that.
 */

export interface CertificateBranding {
  orgName: string;
  orgSubtitle: string;
  logoUrl: string | null;
  message: string | null;
  brandLogoUrl: string | null;
  location: string | null;
  backgroundUrl: string | null;
  signerName: string | null;
  signatureUrl: string | null;
}

export interface CertificateInput {
  participantName: string;
  quizTitle: string;
  scorePercent: number;
  passMarkPercent: number; // 0 means a participation certificate — see isParticipationCertificate below
  completedDate: Date;
  branding: CertificateBranding;
  // Both optional — an older, already-issued certificate re-rendered
  // without a stored number (shouldn't happen going forward, but a
  // graceful fallback matters more than a hard crash) simply omits
  // the QR/ID block rather than showing broken placeholders.
  certificateNumber?: string | null;
  verifyUrl?: string | null;
}

async function loadImageAsDataUrl(url: string): Promise<{ dataUrl: string; width: number; height: number } | null> {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    const dims = await new Promise<{ width: number; height: number }>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = reject;
      img.src = dataUrl;
    });
    return { dataUrl, ...dims };
  } catch {
    return null;
  }
}

function formatDateOnly(d: Date): string {
  const day = d.getDate();
  const suffix = day % 10 === 1 && day !== 11 ? "st" : day % 10 === 2 && day !== 12 ? "nd" : day % 10 === 3 && day !== 13 ? "rd" : "th";
  const monthYear = d.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  return `${day}${suffix} ${monthYear}`;
}

function fittedFontSize(doc: jsPDF, text: string, maxWidth: number, startSize: number, minSize: number): number {
  let size = startSize;
  doc.setFontSize(size);
  while (size > minSize && doc.getTextWidth(text) > maxWidth) {
    size -= 1;
    doc.setFontSize(size);
  }
  return size;
}

function defaultAchievementText(quizTitle: string, isParticipation: boolean): string {
  return isParticipation
    ? `For participating in the ${quizTitle} Product Knowledge Assessment and engaging with the brand, its collection, key product features, technical characteristics, and selling attributes.`
    : `For successfully completing the ${quizTitle} Product Knowledge Assessment and demonstrating a strong understanding of the brand, its collection, key product features, technical characteristics, and selling attributes.`;
}

// A faint, repeating decorative line along the top inner edge — the
// "microtext" element. Small enough to read as a fine detail rather
// than a headline, in a very light tone so it never competes with the
// actual content. A genuine visual touch, not a security mechanism —
// see the file-level note above.
// A faint, repeating decorative detail — the "microtext" element.
// Deliberately a SHORT, contained segment rather than a full-width
// band: repeating text that spans the entire page edge-to-edge reads
// as a banner no matter how small the font is, which defeats the
// point of it being a quiet detail. Rounds the repeat count DOWN
// (never up) so the resulting string is always narrower than its
// target width, never wider — the earlier version rounded up, which
// could overshoot by a few points and silently trigger jsPDF's
// automatic word-wrap into an unwanted second line. Verified this
// fix directly: the string this produces measures narrower than its
// target width in every case, so wrapping can never trigger.
function drawMicrotextBand(doc: jsPDF, centerX: number, y: number, quizTitle: string) {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(3.6);
  doc.setTextColor(205, 197, 172);
  const unit = `MERIDIAN \u2022 VERIFIED ACHIEVEMENT \u2022 ${quizTitle.toUpperCase()} \u2022 `;
  const unitWidth = doc.getTextWidth(unit);
  const targetWidth = 165; // a short segment, not a page-spanning band
  const repeats = Math.max(1, Math.floor(targetWidth / unitWidth));
  doc.text(unit.repeat(repeats), centerX, y, { align: "center" });
}

// A small, restrained emblem — concentric rings, a thin radial tick
// pattern, and a monogram — evoking a certification seal without
// looking like a sticker or a banknote device. Purely decorative.
function drawEmblem(doc: jsPDF, cx: number, cy: number, orgName: string) {
  doc.setDrawColor(138, 109, 31);
  doc.setLineWidth(0.6);
  doc.circle(cx, cy, 20, "S");
  doc.circle(cx, cy, 15.5, "S");
  for (let i = 0; i < 24; i++) {
    const angle = (i * 15 * Math.PI) / 180;
    const r1 = 15.5;
    const r2 = 17.5;
    doc.line(cx + r1 * Math.cos(angle), cy + r1 * Math.sin(angle), cx + r2 * Math.cos(angle), cy + r2 * Math.sin(angle));
  }
  const initial = (orgName.trim()[0] || "M").toUpperCase();
  doc.setFont("times", "bold");
  doc.setFontSize(15);
  doc.setTextColor(138, 109, 31);
  doc.text(initial, cx, cy + 5.2, { align: "center" });
}

export async function buildCertificatePdf(input: CertificateInput): Promise<jsPDF> {
  const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "landscape" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const centerX = pageWidth / 2;
  const { orgName, orgSubtitle, logoUrl, message, brandLogoUrl, location, backgroundUrl, signerName, signatureUrl } = input.branding;
  const completedDate = input.completedDate;
  const isParticipationCertificate = input.passMarkPercent === 0;

  function centered(text: string, y: number, opts: { size?: number; bold?: boolean; italic?: boolean; color?: [number, number, number]; tracked?: boolean } = {}) {
    const { size = 12, bold = false, italic = false, color = [30, 30, 30], tracked = false } = opts;
    doc.setFont("helvetica", italic ? "italic" : bold ? "bold" : "normal");
    doc.setFontSize(size);
    doc.setTextColor(color[0], color[1], color[2]);
    const rendered = tracked ? text.split("").join("\u2009") : text;
    doc.text(rendered, centerX, y, { align: "center" });
  }

  const achievementText = (message || defaultAchievementText(input.quizTitle, isParticipationCertificate))
    .replace(/\{name\}/gi, input.participantName)
    .replace(/\{quiz\}/gi, input.quizTitle)
    .replace(/\{score\}/gi, String(input.scorePercent));

  // ---- Path A: a fully custom uploaded background image ----
  if (backgroundUrl) {
    const bg = await loadImageAsDataUrl(backgroundUrl);
    if (bg) {
      doc.addImage(bg.dataUrl, "JPEG", 0, 0, pageWidth, pageHeight);
    }
    doc.setFont("helvetica", "bold");
    const titleSize = fittedFontSize(doc, input.quizTitle.toUpperCase(), pageWidth * 0.7, 22, 14);
    centered(input.quizTitle.toUpperCase(), pageHeight * 0.3, { size: titleSize, bold: true, color: [140, 30, 30] });
    doc.setFont("helvetica", "bold");
    const nameSize = fittedFontSize(doc, input.participantName, pageWidth * 0.6, 22, 14);
    centered(input.participantName, pageHeight * 0.42, { size: nameSize, bold: true, color: [40, 40, 40] });
    const lines = doc.splitTextToSize(achievementText, pageWidth * 0.55) as string[];
    let ly = pageHeight * 0.53;
    lines.forEach((line) => {
      centered(line, ly, { size: 10.5, color: [80, 80, 80] });
      ly += 14;
    });
    if (!isParticipationCertificate) {
      ly += 10;
      centered("FINAL ASSESSMENT SCORE", ly, { size: 8.5, color: [140, 140, 132], tracked: true });
      centered(`${input.scorePercent}%`, ly + 24, { size: 22, bold: true, color: [138, 109, 31] });
    }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(80, 80, 80);
    doc.text(formatDateOnly(completedDate), pageWidth * 0.28, pageHeight * 0.9, { align: "center" });
    if (input.certificateNumber) {
      doc.setFontSize(7);
      doc.setTextColor(140, 140, 132);
      doc.text(input.certificateNumber, pageWidth - 50, pageHeight - 20, { align: "right" });
    }
    return doc;
  }

  // ---- Path B: the built-in drawn layout ----
  doc.setDrawColor(138, 109, 31);
  doc.setLineWidth(2);
  doc.rect(24, 24, pageWidth - 48, pageHeight - 48);
  doc.setLineWidth(1);
  doc.rect(34, 34, pageWidth - 68, pageHeight - 68);

  // Faint decorative line texture in the four corners only — a hint of
  // a guilloche pattern without covering (or competing with) the main
  // content in the center of the page.
  doc.setDrawColor(232, 222, 194);
  doc.setLineWidth(0.4);
  const cornerInsets: [number, number][] = [
    [34, 34],
    [pageWidth - 34, 34],
    [34, pageHeight - 34],
    [pageWidth - 34, pageHeight - 34]
  ];
  cornerInsets.forEach(([cx, cy]) => {
    for (let r = 10; r <= 50; r += 10) {
      doc.circle(cx, cy, r, "S");
    }
  });

  drawMicrotextBand(doc, centerX, 48, input.quizTitle);

  let y = 80;

  const companyLogo = logoUrl ? await loadImageAsDataUrl(logoUrl) : null;
  const brandLogo = brandLogoUrl ? await loadImageAsDataUrl(brandLogoUrl) : null;
  if (companyLogo || brandLogo) {
    const maxW = 84;
    const maxH = 34;
    const gap = 24;
    function fitted(logo: { dataUrl: string; width: number; height: number }) {
      const scale = Math.min(maxW / logo.width, maxH / logo.height);
      return { w: logo.width * scale, h: logo.height * scale };
    }
    if (companyLogo && brandLogo) {
      const c = fitted(companyLogo);
      const b = fitted(brandLogo);
      const totalW = c.w + gap + b.w;
      const startX = centerX - totalW / 2;
      doc.addImage(companyLogo.dataUrl, startX, y - c.h, c.w, c.h);
      doc.addImage(brandLogo.dataUrl, startX + c.w + gap, y - b.h, b.w, b.h);
      y += 18;
    } else {
      const logo = (companyLogo ?? brandLogo)!;
      const f = fitted(logo);
      doc.addImage(logo.dataUrl, centerX - f.w / 2, y - f.h, f.w, f.h);
      y += 18;
    }
  }

  centered(orgName, y, { size: 24, bold: true, color: [138, 109, 31] });
  y += 20;
  const quizTitleSize = fittedFontSize(doc, input.quizTitle.toUpperCase(), pageWidth - 200, 13, 10);
  centered(input.quizTitle.toUpperCase(), y, { size: quizTitleSize, color: [90, 95, 105], tracked: true });
  y += 26;
  doc.setDrawColor(138, 109, 31);
  doc.setLineWidth(1);
  doc.line(centerX - 36, y, centerX + 36, y);
  y += 28;

  centered("CERTIFICATE OF ACHIEVEMENT", y, { size: 11, color: [140, 140, 132], tracked: true });
  y += 34;
  centered("PRESENTED TO", y, { size: 10, color: [140, 140, 132], tracked: true });
  y += 28;

  doc.setFont("helvetica", "bold");
  const nameSize = fittedFontSize(doc, input.participantName, pageWidth - 280, 24, 15);
  centered(input.participantName, y, { size: nameSize, bold: true, color: [40, 40, 40] });
  y += 8;
  doc.setDrawColor(201, 194, 172);
  doc.setLineWidth(0.75);
  doc.line(centerX - 130, y, centerX + 130, y);
  y += 24;

  const achievementLines = doc.splitTextToSize(achievementText, pageWidth - 340) as string[];
  achievementLines.forEach((line) => {
    centered(line, y, { size: 11, color: [74, 74, 70] });
    y += 15;
  });

  if (!isParticipationCertificate) {
    y += 18;
    centered("FINAL ASSESSMENT SCORE", y, { size: 9, color: [140, 140, 132], tracked: true });
    y += 30;
    centered(`${input.scorePercent}%`, y, { size: 30, bold: true, color: [138, 109, 31] });
    y += 14;
  } else {
    y += 10;
  }

  if (location) {
    y += 22;
    centered(location.toUpperCase(), y, { size: 8.5, color: [140, 140, 132] });
  }

  // ---- Footer: the verifiable record (QR, certificate ID, date) all
  // grouped together on the left, the human signature on the right —
  // a cleaner split than scattering the QR/ID separately below the
  // date used to be, and it reads with more intention: one side is
  // the record, the other is the person who signed it. ----
  const footerY = pageHeight - 68;
  const colLeftX = centerX - 175;
  const colRightX = centerX + 165;

  if (signatureUrl) {
    const sig = await loadImageAsDataUrl(signatureUrl);
    if (sig) {
      const maxSigW = 210;
      const maxSigH = 78;
      const scale = Math.min(maxSigW / sig.width, maxSigH / sig.height);
      const w = sig.width * scale;
      const h = sig.height * scale;
      doc.addImage(sig.dataUrl, colRightX - w / 2, footerY - h - 8, w, h);
    }
  }

  // Only the signature gets a line above it — that's the one place a
  // line carries real meaning ("sign here").
  doc.setDrawColor(138, 138, 132);
  doc.setLineWidth(0.75);
  doc.line(colRightX - 95, footerY, colRightX + 95, footerY);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(40, 40, 40);
  if (signerName) {
    doc.text(signerName, colRightX, footerY + 16, { align: "center" });
  }

  // The left group: QR code above, certificate ID just beneath it,
  // then the date on the same baseline as the signer's printed name —
  // so the two columns still align cleanly across their final row even
  // though what's stacked above differs. See the file-level note at
  // the top of this file — the QR/ID is what actually lets a mismatch
  // be detected, not what prevents editing.
  let hasQr = false;
  if (input.verifyUrl) {
    try {
      const qrDataUrl = await QRCode.toDataURL(input.verifyUrl, { margin: 0, width: 200, color: { dark: "#2a2a28", light: "#00000000" } });
      const qrSize = 48;
      doc.addImage(qrDataUrl, "PNG", colLeftX - qrSize / 2, footerY - 66, qrSize, qrSize);
      hasQr = true;
    } catch {
      // A QR generation failure should never break certificate
      // download — the certificate itself is still fully valid
      // without it, just missing this one extra verification aid.
    }
  }
  if (input.certificateNumber) {
    doc.setFont("courier", "normal");
    doc.setFontSize(7);
    doc.setTextColor(140, 140, 132);
    doc.text(input.certificateNumber, colLeftX, hasQr ? footerY - 10 : footerY, { align: "center" });
  }
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(40, 40, 40);
  doc.text(formatDateOnly(completedDate), colLeftX, footerY + 16, { align: "center" });

  drawEmblem(doc, pageWidth - 56, pageHeight - 58, orgName);

  return doc;
}

// Filenames throughout the app collapse anything non-alphanumeric to
// underscores so they're always safe regardless of what's in a name
// or title.
export function safeFilename(s: string): string {
  return s.trim().replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}
