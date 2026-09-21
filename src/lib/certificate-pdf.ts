import { jsPDF } from "jspdf";

/**
 * The certificate's actual drawing logic, extracted out of the
 * participant results page so it can be reused for a preview in
 * Branding settings — the exact same code draws both, so a preview
 * can never drift out of sync with what a real participant gets.
 * Takes plain, explicit values rather than reading component state,
 * which is what makes it usable from two very different contexts.
 */

export interface CertificateBranding {
  orgName: string;
  orgSubtitle: string;
  logoUrl: string | null;
  message: string | null;
  brandLogoUrl: string | null;
  location: string | null;
  backgroundUrl: string | null;
}

export interface CertificateInput {
  participantName: string;
  quizTitle: string;
  scorePercent: number;
  passMarkPercent: number; // 0 means a participation certificate — see isParticipationCertificate below
  completedDate: Date;
  branding: CertificateBranding;
}

// Loads a remote image as a data URL jsPDF can actually embed —
// addImage() needs base64 data or an HTMLImageElement, not a plain URL,
// since the PDF is a self-contained file with no network access of its
// own once downloaded.
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

export async function buildCertificatePdf(input: CertificateInput): Promise<jsPDF> {
  const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "landscape" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const centerX = pageWidth / 2;
  const { orgName, orgSubtitle, logoUrl, message, brandLogoUrl, location, backgroundUrl } = input.branding;
  const completedDate = input.completedDate;

  function centered(text: string, y: number, opts: { size?: number; bold?: boolean; italic?: boolean; color?: [number, number, number]; tracked?: boolean } = {}) {
    const { size = 12, bold = false, italic = false, color = [30, 30, 30], tracked = false } = opts;
    doc.setFont("helvetica", italic ? "italic" : bold ? "bold" : "normal");
    doc.setFontSize(size);
    doc.setTextColor(color[0], color[1], color[2]);
    const rendered = tracked ? text.split("").join("\u2009") : text;
    doc.text(rendered, centerX, y, { align: "center" });
  }

  const isParticipationCertificate = input.passMarkPercent === 0;
  const defaultAchievementText = isParticipationCertificate
    ? `En reconnaissance de sa participation au programme ${orgName} ${orgSubtitle}.`
    : `En reconnaissance de la r\u00e9ussite du programme ${orgName} ${orgSubtitle}, avec un score de {score}%.`;
  const achievementText = (message || defaultAchievementText)
    .replace(/\{name\}/gi, input.participantName)
    .replace(/\{score\}/gi, String(input.scorePercent));

  // ---- Path A: a fully custom uploaded background image ----
  if (backgroundUrl) {
    const bg = await loadImageAsDataUrl(backgroundUrl);
    if (bg) {
      doc.addImage(bg.dataUrl, "JPEG", 0, 0, pageWidth, pageHeight);
    }
    centered(input.quizTitle.toUpperCase(), pageHeight * 0.32, { size: 22, bold: true, color: [140, 30, 30] });
    centered(input.participantName, pageHeight * 0.46, { size: 22, bold: true, color: [40, 40, 40] });
    const lines = doc.splitTextToSize(achievementText, pageWidth * 0.55) as string[];
    let ly = pageHeight * 0.58;
    lines.forEach((line) => {
      centered(line, ly, { size: 10.5, color: [80, 80, 80] });
      ly += 14;
    });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(80, 80, 80);
    doc.text(completedDate.toLocaleDateString(), pageWidth * 0.28, pageHeight * 0.88, { align: "center" });
    return doc;
  }

  // ---- Path B: the built-in drawn layout ----
  doc.setDrawColor(140, 30, 30);
  doc.setLineWidth(3);
  doc.rect(20, 20, pageWidth - 40, pageHeight - 40);
  doc.setLineWidth(1);
  doc.rect(30, 30, pageWidth - 60, pageHeight - 60);

  let y = 75;

  const companyLogo = logoUrl ? await loadImageAsDataUrl(logoUrl) : null;
  const brandLogo = brandLogoUrl ? await loadImageAsDataUrl(brandLogoUrl) : null;
  if (companyLogo || brandLogo) {
    const maxW = 90;
    const maxH = 38;
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
      y += 20;
    } else {
      const logo = (companyLogo ?? brandLogo)!;
      const f = fitted(logo);
      doc.addImage(logo.dataUrl, centerX - f.w / 2, y - f.h, f.w, f.h);
      y += 20;
    }
  }

  centered(orgName, y, { size: 22, bold: true, color: [90, 95, 105] });
  doc.setDrawColor(140, 30, 30);
  doc.setLineWidth(1.5);
  doc.line(centerX - 55, y + 8, centerX + 55, y + 8);
  y += 34;
  centered(orgSubtitle, y, { size: 13, color: [90, 95, 105], tracked: true });
  y += 55;

  centered("CERTIFI\u00c9", y, { size: 15, color: [90, 95, 105], tracked: true });
  y += 40;
  centered(input.quizTitle.toUpperCase(), y, { size: 26, bold: true, color: [140, 30, 30] });
  y += 34;
  centered("D\u00c9CERN\u00c9 \u00c0", y, { size: 12, color: [60, 60, 60], tracked: true });
  y += 45;

  centered(input.participantName, y, { size: 22, bold: true, color: [40, 40, 40] });
  y += 8;
  doc.setDrawColor(150, 150, 150);
  doc.setLineWidth(0.75);
  doc.line(centerX - 160, y, centerX + 160, y);
  y += 34;

  const achievementLines = doc.splitTextToSize(achievementText.toUpperCase(), pageWidth - 260) as string[];
  achievementLines.forEach((line) => {
    centered(line, y, { size: 11, color: [50, 50, 50] });
    y += 16;
  });
  y += 20;

  const dialCenterY = y + 55;
  doc.setDrawColor(225, 205, 205);
  doc.setLineWidth(1);
  doc.circle(centerX, dialCenterY, 58, "S");
  doc.circle(centerX, dialCenterY, 48, "S");
  for (let i = 0; i < 12; i++) {
    const angle = (i * 30 * Math.PI) / 180;
    const x1 = centerX + 52 * Math.sin(angle);
    const y1 = dialCenterY - 52 * Math.cos(angle);
    const x2 = centerX + 58 * Math.sin(angle);
    const y2 = dialCenterY - 58 * Math.cos(angle);
    doc.line(x1, y1, x2, y2);
  }
  y = dialCenterY + 70;

  const sealY = y + 26;
  doc.setFillColor(120, 20, 25);
  doc.circle(centerX, sealY, 24, "F");
  doc.setDrawColor(160, 60, 60);
  doc.setLineWidth(1);
  doc.circle(centerX, sealY, 18, "S");
  const initials = orgName
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 3)
    .toUpperCase();
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(190, 140, 140);
  doc.text(initials, centerX, sealY + 4, { align: "center" });
  y = sealY + 50;

  if (location) {
    centered(location.toUpperCase(), y, { size: 8.5, color: [90, 90, 90] });
    y += 12;
  }

  const footerY = pageHeight - 55;
  doc.setDrawColor(90, 90, 90);
  doc.setLineWidth(0.75);
  doc.line(70, footerY, 230, footerY);
  doc.line(pageWidth - 230, footerY, pageWidth - 70, footerY);

  doc.setFont("helvetica", "italic");
  doc.setFontSize(16);
  doc.setTextColor(60, 60, 90);
  doc.text("A.", pageWidth - 190, footerY - 10);
  doc.setLineWidth(1);
  doc.line(pageWidth - 175, footerY - 14, pageWidth - 150, footerY - 20);
  doc.line(pageWidth - 150, footerY - 20, pageWidth - 120, footerY - 8);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(90, 90, 90);
  doc.text(completedDate.toLocaleDateString("fr-FR"), 150, footerY + 14, { align: "center" });
  doc.text("DATE", 150, footerY + 26, { align: "center" });
  doc.text("DIRECTEUR ACAD\u00c9MIQUE", pageWidth - 150, footerY + 26, { align: "center" });

  return doc;
}

// Filenames throughout the app collapse anything non-alphanumeric to
// underscores so they're always safe regardless of what's in a name
// or title.
export function safeFilename(s: string): string {
  return s.trim().replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}
