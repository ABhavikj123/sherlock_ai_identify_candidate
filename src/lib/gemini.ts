import { clamp01 } from "@/lib/math";

type GeminiPart = {
  text?: string;
};

type GeminiCandidate = {
  content?: {
    parts?: GeminiPart[];
  };
};

type GeminiResponse = {
  candidates?: GeminiCandidate[];
};

export async function analyzeTextIntent(text: string, prompt: string): Promise<number> {
  const cleanText = text.trim();
  if (!cleanText) {
    return 0.5;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return fallbackIntent(cleanText);
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-3.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: `${prompt}\n\nText:\n${cleanText.slice(-3000)}` }],
            },
          ],
          generationConfig: {
            temperature: 0,
            maxOutputTokens: 8,
          },
        }),
      },
    );

    if (!response.ok) {
      return fallbackIntent(cleanText);
    }

    const data = (await response.json()) as GeminiResponse;
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
    const parsed = parseNumericScore(raw);
    if (!Number.isFinite(parsed)) {
      return fallbackIntent(cleanText);
    }

    return clamp01(parsed);
  } catch {
    return fallbackIntent(cleanText);
  }
}

function parseNumericScore(value: string): number {
  const match = value.match(/(?:0(?:\.\d+)?|1(?:\.0+)?)/);
  return match ? Number.parseFloat(match[0]) : Number.NaN;
}

function fallbackIntent(text: string): number {
  const lower = text.toLowerCase();
  const questionMarks = (text.match(/\?/g) ?? []).length;
  const answerSignals = [
    "i am",
    "i'm",
    "i have",
    "i built",
    "i used",
    "my role",
    "my approach",
    "my experience",
    "because",
    "implemented",
    "developed",
    "debugged",
    "worked on",
    "full stack",
    "frontend",
    "backend",
  ];
  const questionSignals = [
    "can you",
    "could you",
    "tell me",
    "explain",
    "what is",
    "how would",
    "why did",
    "give introduction",
    "introduce yourself",
    "walk me through",
    "describe",
    "question",
  ];
  const interviewerCommands = ["give", "tell", "explain", "describe", "walk"];
  const startsLikePrompt = interviewerCommands.some((signal) => lower.startsWith(signal));
  const answerScore = answerSignals.filter((signal) => lower.includes(signal)).length * 0.14;
  const questionScore =
    questionSignals.filter((signal) => lower.includes(signal)).length * 0.16 +
    questionMarks * 0.12 +
    (startsLikePrompt ? 0.18 : 0);

  return clamp01(0.52 + answerScore - questionScore);
}
