/**
 * Seeds one sample quiz template with the 5 required fictional/educational
 * questions (spec §46): standard, image, technical, wrong-answer-feedback,
 * and speed-bonus/AI-feedback demonstration questions.
 *
 * Run with: npm run seed
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.
 */
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}

const supabase = createClient(url, key);

const PLACEHOLDER_IMAGE = "https://placehold.co/800x450/1E1B17/C9A24B?text=Chronograph+Dial";

async function main() {
  const { data: quiz, error: quizError } = await supabase
    .from("quizzes")
    .insert({
      title: "Horology Foundations — Sample Quiz",
      description: "A 5-question sample covering complications, movements, materials, and customer scenarios. Safe to duplicate, edit, or delete.",
      time_limit_minutes: 10,
      pass_mark_percent: 60,
      leaderboard_enabled: true,
      ai_feedback_enabled: true,
      randomize_questions: false,
      randomize_answers: false,
      back_navigation_enabled: false,
      scoring_mode: "speed_bonus",
      speed_bonus_window_seconds: 20,
      after_answer_mode: "auto_advance",
      status: "published"
    })
    .select()
    .single();

  if (quizError) throw quizError;
  console.log(`Created quiz: ${quiz.title} (${quiz.id})`);

  const questions = [
    {
      // 1. Standard question
      order_index: 0,
      question_text: "What does the 'GMT' complication on a watch allow the wearer to track?",
      image_url: null,
      option_a: "A second time zone",
      option_b: "Elapsed dive time",
      option_c: "Barometric pressure",
      option_d: "Moon phase",
      correct_option: "A",
      explanation: "GMT stands for Greenwich Mean Time. A GMT complication adds a 24-hour hand and often a rotating bezel so the wearer can read a second time zone at a glance.",
      wrong_feedback_a: "",
      wrong_feedback_b: "",
      wrong_feedback_c: "",
      wrong_feedback_d: "",
      category: "Complications",
      difficulty: "easy",
      learning_topic: "GMT function"
    },
    {
      // 2. Image question
      order_index: 1,
      question_text: "The outer scale shown in the image is used to calculate speed over a known distance. What is this scale called?",
      image_url: PLACEHOLDER_IMAGE,
      option_a: "Telemeter scale",
      option_b: "Tachymeter scale",
      option_c: "Pulsometer scale",
      option_d: "Compass scale",
      correct_option: "B",
      explanation: "A tachymeter scale converts elapsed time over a fixed distance into a speed reading — commonly used with chronograph functions.",
      wrong_feedback_a: "",
      wrong_feedback_b: "",
      wrong_feedback_c: "",
      wrong_feedback_d: "",
      category: "Chronograph",
      difficulty: "medium",
      learning_topic: "Chronograph scales"
    },
    {
      // 3. Technical question
      order_index: 2,
      question_text: "In a mechanical movement, what is the primary function of the escapement?",
      image_url: null,
      option_a: "To store energy from winding",
      option_b: "To regulate the controlled release of energy from the mainspring",
      option_c: "To display the date",
      option_d: "To seal the case against water",
      correct_option: "B",
      explanation: "The escapement releases the mainspring's stored energy in small, regular increments, which is what allows the movement to keep consistent time.",
      wrong_feedback_a: "",
      wrong_feedback_b: "",
      wrong_feedback_c: "",
      wrong_feedback_d: "",
      category: "Movements",
      difficulty: "hard",
      learning_topic: "Escapement mechanics"
    },
    {
      // 4. Question with wrong-answer explanations
      order_index: 3,
      question_text: "Which crystal material offers the best scratch resistance for a watch face?",
      image_url: null,
      option_a: "Acrylic",
      option_b: "Mineral glass",
      option_c: "Sapphire",
      option_d: "Polycarbonate",
      correct_option: "C",
      explanation: "Sapphire crystal rates 9 on the Mohs hardness scale — only diamond is harder — making it far more scratch-resistant than mineral glass or acrylic.",
      wrong_feedback_a: "Acrylic is the softest common option, prone to scratching, though easy to polish out.",
      wrong_feedback_b: "Mineral glass is more scratch-resistant than acrylic but noticeably softer than sapphire.",
      wrong_feedback_c: "",
      wrong_feedback_d: "Polycarbonate is impact-resistant but scratches easily — it's chosen for toughness, not hardness.",
      category: "Materials",
      difficulty: "medium",
      learning_topic: "Crystal materials"
    },
    {
      // 5. Speed bonus + AI feedback demonstration question
      order_index: 4,
      question_text: "A customer says their automatic watch stops overnight when left on the nightstand. What's the most likely explanation?",
      image_url: null,
      option_a: "The watch is faulty and needs repair",
      option_b: "It wasn't wound enough by wrist motion during the day to sustain its full power reserve overnight",
      option_c: "Automatic watches always stop when not being worn",
      option_d: "The battery has died",
      correct_option: "B",
      explanation: "Automatic watches rely on wrist motion to wind the mainspring. If it wasn't worn long enough or actively enough during the day, the power reserve can run out overnight. A watch winder or a few minutes of manual winding solves this.",
      wrong_feedback_a: "This is a common but usually incorrect first assumption — an insufficient power reserve is far more likely than a fault.",
      wrong_feedback_b: "",
      wrong_feedback_c: "A fully wound automatic can run 38-70+ hours off the wrist, so this isn't always true.",
      wrong_feedback_d: "Automatic watches don't use a battery — this points to a different type of movement.",
      category: "Customer scenarios",
      difficulty: "medium",
      learning_topic: "Automatic movement power reserve"
    }
  ];

  const { error: qError } = await supabase.from("questions").insert(questions.map((q) => ({ ...q, quiz_id: quiz.id })));
  if (qError) throw qError;

  console.log(`Inserted ${questions.length} sample questions.`);
  console.log("\nDone. Open /admin, log in, and you'll see this quiz in My Quizzes.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
