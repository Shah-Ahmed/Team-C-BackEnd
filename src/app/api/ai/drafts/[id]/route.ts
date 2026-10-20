// /api/ai/drafts/:id
// GET:    Retrieve a single draft (enforcing organization ownership)
// PUT:    Update draft text, status, or media
// DELETE: Remove draft from Firestore

import { apiHandler, json, preflight } from "@/lib/api";
import { HttpError } from "@/lib/errors";
import { readJson } from "@/lib/validate";
import { deleteDraft, getDraftById, updateDraft } from "@/lib/ai/drafts";
import type { DraftStatus, MediaReference } from "@/types";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

const ALLOWED_STATUSES: readonly DraftStatus[] = [
  "draft",
  "reviewed",
  "scheduled",
  "archived",
];

function sanitizeMedia(rawMedia: unknown): MediaReference[] | undefined {
  if (rawMedia === undefined) return undefined;
  if (!Array.isArray(rawMedia)) return [];
  const result: MediaReference[] = [];

  for (const item of rawMedia) {
    if (typeof item !== "object" || item === null) continue;
    const { url, type, altText } = item as Record<string, unknown>;
    if (typeof url === "string" && url.trim().length > 0 && (type === "image" || type === "video")) {
      result.push({
        url: url.trim(),
        type,
        altText: typeof altText === "string" ? altText.trim() : undefined,
      });
    }
  }

  return result;
}

export const GET = apiHandler({ roles: ["admin", "user"] }, async ({ params, auth }) => {
  if (!auth.orgId) {
    throw new HttpError(403, "Your account is not linked to an organization");
  }

  const id = params.id;
  if (!id) {
    throw new HttpError(400, "Draft ID is required");
  }

  const draft = await getDraftById(auth.orgId, id);
  return json(draft, 200);
});

export const PUT = apiHandler({ roles: ["admin", "user"] }, async ({ params, request, auth }) => {
  if (!auth.orgId) {
    throw new HttpError(403, "Your account is not linked to an organization");
  }

  const id = params.id;
  if (!id) {
    throw new HttpError(400, "Draft ID is required");
  }

  const body = await readJson(request);

  const title = typeof body.title === "string" ? body.title.trim() : undefined;
  const generatedContent = typeof body.generatedContent === "string" ? body.generatedContent.trim() : undefined;
  const status = typeof body.status === "string" && ALLOWED_STATUSES.includes(body.status as DraftStatus)
    ? (body.status as DraftStatus)
    : undefined;

  const hashtags = Array.isArray(body.hashtags)
    ? body.hashtags.filter((tag) => typeof tag === "string" && tag.startsWith("#"))
    : undefined;

  const media = sanitizeMedia(body.media);

  const updated = await updateDraft(auth.orgId, id, {
    title,
    generatedContent,
    hashtags,
    status,
    media,
  });

  return json(updated, 200);
});

export const DELETE = apiHandler({ roles: ["admin", "user"] }, async ({ params, auth }) => {
  if (!auth.orgId) {
    throw new HttpError(403, "Your account is not linked to an organization");
  }

  const id = params.id;
  if (!id) {
    throw new HttpError(400, "Draft ID is required");
  }

  await deleteDraft(auth.orgId, id);
  return json({ success: true }, 200);
});
