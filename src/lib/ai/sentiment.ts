// Sentiment analysis service layer for Team C.
// Analyzes social media text and reviews, classifying into positive, neutral, or negative.
// Uses Google Gemini when configured with automatic failover, and provides a deterministic
// lexicon-based fallback when offline or without credentials.
// Persists results in the aiSentimentResults collection with organization isolation.

import { getAdminDb } from "@/lib/firebaseAdmin";
import { HttpError } from "@/lib/errors";
import type {
  AnalyzeSentimentInput,
  SentimentResultDoc,
  SentimentSummary,
  SentimentType,
} from "@/types";

const COLLECTION_NAME = "aiSentimentResults";

const GEMINI_MODELS = [
  "gemini-3.5-flash-lite",
  "gemini-3.6-flash",
  "gemini-3.8-flash",
];

const POSITIVE_WORDS = new Set([
  "love", "loved", "loves", "loving", "great", "awesome", "excellent", "saved",
  "helpful", "fast", "perfect", "good", "smooth", "easy", "best", "amazing",
  "outstanding", "delightful", "valuable", "clean", "efficient", "recommend",
  "impressive", "superb", "fantastic", "pleased", "reliable", "happy", "brilliant",
  "wonderful", "seamless", "innovative", "effective", "favorite"
]);

const NEGATIVE_WORDS = new Set([
  "fail", "failed", "fails", "failing", "broken", "terrible", "awful", "bug",
  "bugs", "error", "errors", "slow", "hate", "hated", "poor", "bad", "worst",
  "disappointed", "disappointing", "missing", "waste", "useless", "crash",
  "crashes", "stuck", "horrible", "unacceptable", "annoying", "frustrating",
  "difficult", "garbage", "trash", "broken", "glitch", "flawed"
]);

const STOPWORDS = new Set([
  "the", "and", "a", "an", "for", "with", "this", "that", "from", "have",
  "has", "had", "about", "are", "were", "been", "was", "is", "it", "its",
  "they", "them", "their", "we", "our", "you", "your", "my", "me", "i",
  "to", "in", "on", "at", "by", "as", "of", "or", "but", "so", "very",
  "too", "just", "now", "then", "more", "some", "any", "all"
]);

/**
 * Extracts key topic themes from text by finding non-stopword tokens.
 */
function extractFallbackThemes(text: string): string[] {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOPWORDS.has(w));

  const frequencies = new Map<string, number>();
  for (const word of words) {
    frequencies.set(word, (frequencies.get(word) || 0) + 1);
  }

  const sorted = Array.from(frequencies.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([word]) => word);

  return sorted.slice(0, 4);
}

/**
 * Deterministic lexicon-based sentiment analyzer.
 * Returns sentiment classification, score, and key themes without external network dependencies.
 */
function analyzeSentimentMock(text: string): {
  sentiment: SentimentType;
  score: number;
  keyThemes: string[];
} {
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  let posCount = 0;
  let negCount = 0;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const prev = i > 0 ? tokens[i - 1] : "";
    const isNegated = ["not", "no", "never", "hardly", "barely"].includes(prev);

    if (POSITIVE_WORDS.has(token)) {
      if (isNegated) {
        negCount += 1.5;
      } else {
        posCount += 1;
      }
    } else if (NEGATIVE_WORDS.has(token)) {
      if (isNegated) {
        posCount += 1;
      } else {
        negCount += 1.5;
      }
    }
  }

  const themes = extractFallbackThemes(text);
  const totalMatches = posCount + negCount;

  if (totalMatches === 0) {
    return {
      sentiment: "neutral",
      score: 0.50,
      keyThemes: themes.length > 0 ? themes : ["general-feedback"],
    };
  }

  if (posCount > negCount) {
    const ratio = posCount / totalMatches;
    const score = Math.min(0.98, Math.max(0.60, Number((0.55 + ratio * 0.40).toFixed(2))));
    return {
      sentiment: "positive",
      score,
      keyThemes: themes.length > 0 ? themes : ["satisfaction"],
    };
  }

  if (negCount > posCount) {
    const ratio = negCount / totalMatches;
    const score = Math.min(0.98, Math.max(0.60, Number((0.55 + ratio * 0.40).toFixed(2))));
    return {
      sentiment: "negative",
      score,
      keyThemes: themes.length > 0 ? themes : ["issues"],
    };
  }

  return {
    sentiment: "neutral",
    score: 0.50,
    keyThemes: themes.length > 0 ? themes : ["general-feedback"],
  };
}

/**
 * Calls live Google Gemini models to perform sentiment classification and key theme extraction.
 */
async function callGeminiSentiment(
  text: string,
  apiKey: string
): Promise<{ sentiment: SentimentType; score: number; keyThemes: string[] }> {
  const promptText = `
Analyze the sentiment of the following text:
"${text}"

Classify into strictly one of: "positive", "neutral", "negative".
Provide a confidence score between 0.00 and 1.00.
Extract 1 to 4 concise key themes or topics mentioned in the text.

STRICT CONSTRAINTS:
1. Do not use any emojis in your response.
2. Return only valid JSON with this exact schema:
{
  "sentiment": "positive" | "neutral" | "negative",
  "score": 0.85,
  "keyThemes": ["theme1", "theme2"]
}
`;

  let lastError: Error | null = null;

  for (const model of GEMINI_MODELS) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: promptText }] }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 500,
            responseMimeType: "application/json",
          },
        }),
        signal: AbortSignal.timeout(25000),
      });

      if (!response.ok) {
        const errorText = await response.text();
        lastError = new Error(`Gemini sentiment error (${response.status}): ${errorText.slice(0, 150)}`);
        continue;
      }

      const data = (await response.json()) as {
        candidates?: Array<{
          content?: {
            parts?: Array<{ text?: string }>;
          };
        }>;
      };

      const raw = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
      if (!raw) continue;

      const sanitized = raw.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
      const parsed = JSON.parse(sanitized) as {
        sentiment?: string;
        score?: number;
        keyThemes?: string[];
      };

      const rawSentiment = parsed.sentiment?.toLowerCase();
      const sentiment: SentimentType = (rawSentiment === "positive" || rawSentiment === "negative" || rawSentiment === "neutral")
        ? rawSentiment
        : "neutral";

      const score = typeof parsed.score === "number" && !isNaN(parsed.score)
        ? Math.min(1.0, Math.max(0.0, Number(parsed.score.toFixed(2))))
        : 0.75;

      const keyThemes = Array.isArray(parsed.keyThemes)
        ? parsed.keyThemes.filter((t) => typeof t === "string" && t.trim().length > 0).map((t) => t.trim())
        : [];

      return { sentiment, score, keyThemes };
    } catch (err) {
      lastError = err as Error;
    }
  }

  throw lastError || new Error("All Gemini candidate models failed to analyze sentiment");
}

/**
 * Analyzes the sentiment of a text string.
 * Uses Google Gemini when GEMINI_API_KEY is available, or cleanly falls back
 * to a deterministic mock lexicon analyzer.
 */
export async function analyzeSentiment(text: string): Promise<{
  sentiment: SentimentType;
  score: number;
  keyThemes: string[];
  provider: "gemini" | "mock";
}> {
  const geminiKey = process.env.GEMINI_API_KEY?.trim();

  if (geminiKey) {
    try {
      const result = await callGeminiSentiment(text, geminiKey);
      return {
        ...result,
        provider: "gemini",
      };
    } catch (error) {
      console.warn("Gemini sentiment error, falling back to deterministic mock analyzer:", (error as Error).message);
    }
  }

  const mockResult = analyzeSentimentMock(text);
  return {
    ...mockResult,
    provider: "mock",
  };
}

/**
 * Validates text input, analyzes sentiment, and persists the result in Firestore.
 */
export async function saveSentimentResult(
  orgId: string,
  createdBy: string,
  input: AnalyzeSentimentInput
): Promise<SentimentResultDoc> {
  const text = input.text?.trim() || "";
  if (!text) {
    throw new HttpError(400, "Review or text content is required for sentiment analysis");
  }

  if (text.length > 5000) {
    throw new HttpError(400, "Text must not exceed 5000 characters");
  }

  const author = input.author?.trim() || undefined;

  const analysis = await analyzeSentiment(text);
  const now = Date.now();

  const docData: Omit<SentimentResultDoc, "id"> = {
    orgId,
    createdBy,
    text,
    ...(author ? { author } : {}),
    sentiment: analysis.sentiment,
    score: analysis.score,
    keyThemes: analysis.keyThemes,
    provider: analysis.provider,
    createdAt: now,
  };

  const clean = JSON.parse(JSON.stringify(docData));
  const docRef = await getAdminDb().collection(COLLECTION_NAME).add(clean);

  return { id: docRef.id, ...clean };
}

/**
 * Lists sentiment analysis records for an organization, ordered by newest first.
 */
export async function listSentimentResults(
  orgId: string,
  filterSentiment?: SentimentType
): Promise<SentimentResultDoc[]> {
  const db = getAdminDb();
  let query = db.collection(COLLECTION_NAME).where("orgId", "==", orgId);

  if (filterSentiment) {
    query = query.where("sentiment", "==", filterSentiment);
  }

  const snapshot = await query.get();

  const results = snapshot.docs.map((doc) => {
    const data = doc.data() as Omit<SentimentResultDoc, "id">;
    return { id: doc.id, ...data };
  });

  results.sort((a, b) => b.createdAt - a.createdAt);
  return results;
}

/**
 * Aggregates sentiment metrics for the organization.
 * Calculates total count, positive count/percentage, neutral count/percentage,
 * and negative count/percentage for the sentiment analytics cards.
 */
export async function getSentimentSummary(orgId: string): Promise<SentimentSummary> {
  const allResults = await listSentimentResults(orgId);
  const total = allResults.length;

  if (total === 0) {
    return {
      total: 0,
      positive: { count: 0, percentage: 0 },
      neutral: { count: 0, percentage: 0 },
      negative: { count: 0, percentage: 0 },
    };
  }

  let positiveCount = 0;
  let neutralCount = 0;
  let negativeCount = 0;

  for (const item of allResults) {
    if (item.sentiment === "positive") positiveCount++;
    else if (item.sentiment === "neutral") neutralCount++;
    else if (item.sentiment === "negative") negativeCount++;
  }

  return {
    total,
    positive: {
      count: positiveCount,
      percentage: Math.round((positiveCount / total) * 100),
    },
    neutral: {
      count: neutralCount,
      percentage: Math.round((neutralCount / total) * 100),
    },
    negative: {
      count: negativeCount,
      percentage: Math.round((negativeCount / total) * 100),
    },
  };
}
