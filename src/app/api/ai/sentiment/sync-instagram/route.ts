// POST: Fetch new comments from Instagram and run sentiment analysis

import { apiHandler, json, preflight } from "@/lib/api";
import { HttpError } from "@/lib/errors";
import { syncInstagramComments } from "@/lib/ai/sentiment";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

export const POST = apiHandler({ roles: ["admin", "user"] }, async ({ auth }) => {
  if (!auth.orgId) {
    throw new HttpError(403, "Your account is not linked to an organization");
  }

  const result = await syncInstagramComments(auth.orgId, auth.uid);
  return json(result, 200);
});
