// POST: Check for due scheduled posts and publish them automatically

import { apiHandler, json, preflight } from "@/lib/api";
import { HttpError } from "@/lib/errors";
import { processDueScheduledPosts } from "@/lib/ai/schedule";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

export const POST = apiHandler({ roles: ["admin", "user"] }, async ({ auth }) => {
  if (!auth.orgId) {
    throw new HttpError(403, "Your account is not linked to an organization");
  }

  const result = await processDueScheduledPosts(auth.orgId);
  return json(result, 200);
});
