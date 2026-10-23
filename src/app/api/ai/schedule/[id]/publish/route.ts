// /api/ai/schedule/:id/publish
// POST: Publish a scheduled post (manual or triggered publishing)
// Prevents duplicate publishing and simulates execution when real credentials are absent.

import { apiHandler, json, preflight } from "@/lib/api";
import { HttpError } from "@/lib/errors";
import { publishScheduledPost } from "@/lib/ai/schedule";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

export const POST = apiHandler({ roles: ["admin", "user"] }, async ({ params, auth }) => {
  if (!auth.orgId) {
    throw new HttpError(403, "Your account is not linked to an organization");
  }

  const id = params.id;
  if (!id) {
    throw new HttpError(400, "Scheduled post ID is required");
  }

  const result = await publishScheduledPost(auth.orgId, id);
  return json(result, 200);
});
