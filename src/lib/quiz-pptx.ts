import PptxGenJS from "pptxgenjs";

/**
 * Builds a downloadable .pptx from a quiz's questions — one slide per
 * question, correct answer marked, explanation included where set.
 * This reads only existing question data; it has no dependency on the
 * separate "info pages" feature, whose editor UI and live-session
 * rendering aren't built yet (only its backend safety work is) — so
 * export works today regardless of that.
 */

export interface PptxQuestionInput {
  questionText: string;
  imageUrl: string | null;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctOption: "A" | "B" | "C" | "D";
  explanation: string;
}

const GOLD = "8A6D1F";
const CHARCOAL = "1E1E1C";
const CORRECT_GREEN = "2F6B3A";

async function urlToDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export async function buildQuizPptx(quizTitle: string, questions: PptxQuestionInput[]): Promise<PptxGenJS> {
  const pres = new PptxGenJS();
  pres.layout = "LAYOUT_16x9";
  pres.author = "Meridian";
  pres.title = quizTitle;

  // ---- Title slide ----
  const title = pres.addSlide();
  title.background = { color: CHARCOAL };
  title.addText("MERIDIAN", { x: 0.5, y: 2.2, w: 9, h: 0.6, fontSize: 28, bold: true, color: GOLD, align: "center", charSpacing: 4 });
  title.addText(quizTitle, { x: 0.5, y: 2.9, w: 9, h: 1, fontSize: 22, color: "FFFFFF", align: "center" });
  title.addText(`${questions.length} question${questions.length !== 1 ? "s" : ""}`, {
    x: 0.5,
    y: 3.7,
    w: 9,
    h: 0.5,
    fontSize: 13,
    color: "AAAAAA",
    align: "center"
  });

  // ---- One slide per question ----
  const optionLetters: ("A" | "B" | "C" | "D")[] = ["A", "B", "C", "D"];
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const slide = pres.addSlide();
    slide.background = { color: "FDFAF3" };

    slide.addText(`Question ${i + 1}`, { x: 0.4, y: 0.25, w: 9, h: 0.4, fontSize: 12, color: GOLD, bold: true, charSpacing: 2 });
    slide.addText(q.questionText, { x: 0.4, y: 0.6, w: 9.2, h: 1, fontSize: 20, bold: true, color: CHARCOAL, valign: "top" });

    let imageDataUrl: string | null = null;
    if (q.imageUrl) imageDataUrl = await urlToDataUrl(q.imageUrl);

    // Options sit to the left of the image when one exists, otherwise
    // take the full width — computed once so the layout adapts either way.
    const optionsW = imageDataUrl ? 5.2 : 9.2;
    if (imageDataUrl) {
      slide.addImage({ data: imageDataUrl, x: 5.9, y: 1.8, w: 3.7, h: 3.7, sizing: { type: "contain", w: 3.7, h: 3.7 } });
    }

    const options = { A: q.optionA, B: q.optionB, C: q.optionC, D: q.optionD };
    let y = 1.8;
    optionLetters.forEach((letter) => {
      const isCorrect = letter === q.correctOption;
      slide.addText([{ text: `${letter}.  `, options: { bold: true, color: isCorrect ? CORRECT_GREEN : CHARCOAL } }, { text: options[letter], options: { color: isCorrect ? CORRECT_GREEN : CHARCOAL, bold: isCorrect } }], {
        x: 0.4,
        y,
        w: optionsW,
        h: 0.55,
        fontSize: 14,
        valign: "middle"
      });
      if (isCorrect) {
        slide.addText("\u2713 Correct answer", { x: 0.4, y: y + 0.42, w: optionsW, h: 0.3, fontSize: 9, color: CORRECT_GREEN, italic: true });
      }
      y += 0.85;
    });

    if (q.explanation) {
      slide.addText(q.explanation, {
        x: 0.4,
        y: 5.1,
        w: 9.2,
        h: 1.1,
        fontSize: 11,
        color: "555550",
        valign: "top",
        fill: { color: "F1ECDD" },
        margin: 10
      });
    }
  }

  return pres;
}
