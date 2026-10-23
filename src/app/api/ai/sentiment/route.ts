// /api/ai/sentiment
// GET:  List sentiment analysis records for the caller's organization
// POST: Analyze text sentiment and persist the record in Firestore

import { apiHandler, json, preflight } from "@/lib/api";
import { HttpError } from "@/lib/errors";
import { readJson, requireString } from "@/lib/validate";
import { listSentimentResults, saveSentimentResult } from "@/lib/ai/sentiment";
import type { SentimentType } from "@/types";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

const ALLOWED_SENTIMENTS: readonly SentimentType[] = [
  "positive",
  "neutral",
  "negative",
];

export const GET = apiHandler({ roles: ["admin", "user"] }, async ({ request, auth }) => {
  if (!auth.orgId) {
    throw new HttpError(403, "Your account is not linked to an organization");
  }

  const url = new URL(request.url);
  const sentimentParam = url.searchParams.get("sentiment");

  const filterSentiment = sentimentParam && ALLOWED_SENTIMENTS.includes(sentimentParam as SentimentType)
    ? (sentimentParam as SentimentType)
    : undefined;

  const records = await listSentimentResults(auth.orgId, filterSentiment);
  return json(records, 200);
});

export const POST = apiHandler({ roles: ["admin", "user"] }, async ({ request, auth }) => {
  if (!auth.orgId) {
    throw new HttpError(403, "Your account is not linked to an organization");
  }

  const body = await readJson(request);

  const text = requireString(body, "text", { min: 1, max: 5000 });
  const author = typeof body.author === "string" && body.author.trim() ? body.author.trim() : undefined;

  const result = await saveSentimentResult(auth.orgId, auth.uid, {
    text,
    author,
  });

  return json(result, 201);
});
