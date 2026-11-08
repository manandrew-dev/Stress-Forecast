// Tiny keyword "analysis" that stands in for the real check-in model in mock mode.

const STRESS_UP: [RegExp, number][] = [
  [/\b(overwhelm|panic|drowning|breaking down|can'?t cope)/i, 3],
  [/\b(stress|anxious|anxiety|worried|nervous|behind)/i, 2],
  [/\b(tired|exhausted|drained|burn(ed|t)? out)/i, 1.5],
  [/\b(busy|pressure|cramming)/i, 1],
];
const STRESS_DOWN: [RegExp, number][] = [
  [/\b(great|amazing|relaxed|calm|rested)/i, -2],
  [/\b(good|fine|okay|ok|alright|chill)/i, -1],
];

const CAUSES: [RegExp, string][] = [
  [/\b(midterm|exam|final|test)/i, "Upcoming exams"],
  [/\b(assignment|essay|project|lab|homework|webwork|deadline)/i, "Assignment deadlines"],
  [/\b(sleep|tired|exhausted|insomnia|up late)/i, "Not enough sleep"],
  [/\b(job|shift|work(ing)? at)/i, "Part-time work"],
  [/\b(family|parents|home)/i, "Family"],
  [/\b(money|rent|tuition|bills)/i, "Money"],
  [/\b(friend|lonely|alone|roommate)/i, "Social life"],
  [/\b(sick|ill|cold|flu|headache)/i, "Health"],
];

const CONCERNING =
  /\b(hopeless|worthless|can'?t go on|give up on everything|hurt myself|self[- ]harm|kill myself|end it|no point)/i;

export function analyzeCheckin(text: string): {
  stress: number;
  sleep_hours: number | null;
  causes: string[];
  concerning: boolean;
} {
  let stress = 4;
  for (const [re, n] of STRESS_UP) if (re.test(text)) stress += n;
  for (const [re, n] of STRESS_DOWN) if (re.test(text)) stress += n;
  const concerning = CONCERNING.test(text);
  if (concerning) stress = Math.max(stress, 8);
  stress = Math.round(Math.min(10, Math.max(1, stress)));

  const sleepMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\b(?:\s*of)?\s*(?:sleep)?/i);
  const sleep_hours = sleepMatch ? Math.min(14, Number(sleepMatch[1])) : null;

  const causes = CAUSES.filter(([re]) => re.test(text)).map(([, c]) => c);
  return { stress, sleep_hours, causes, concerning };
}
