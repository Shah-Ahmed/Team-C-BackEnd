// /api/ai/sentiment/summary
// GET: Retrieve aggregated sentiment metrics for the caller's organization

import { apiHandler, json, preflight } from "@/lib/api";
import { HttpError } from "@/lib/errors";
import { getSentimentSummary } from "@/lib/ai/sentiment";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

export const GET = apiHandler({ roles: ["admin", "user"] }, async ({ auth }) => {
  if (!auth.orgId) {
    throw new HttpError(403, "Your account is not linked to an organization");
  }

  const summary = await getSentimentSummary(auth.orgId);
  return json(summary, 200);
});
