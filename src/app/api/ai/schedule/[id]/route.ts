// /api/ai/schedule/:id
// GET:    Retrieve a single scheduled post (enforcing organization ownership)
// PUT:    Update scheduling details, content, or status (disallowed if already published)
// DELETE: Cancel and remove a scheduled post

import { apiHandler, json, preflight } from "@/lib/api";
import { HttpError } from "@/lib/errors";
import { readJson } from "@/lib/validate";
import {
  deleteScheduledPost,
  getScheduledPostById,
  isValidTimezone,
  updateScheduledPost,
} from "@/lib/ai/schedule";
import type { MediaReference, Platform, ScheduledPostStatus } from "@/types";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

const ALLOWED_PLATFORMS: readonly Platform[] = [
  "instagram",
  "twitter",
  "linkedin",
  "facebook",
  "general",
];

const ALLOWED_STATUSES: readonly ScheduledPostStatus[] = [
  "draft",
  "scheduled",
  "failed",
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
    throw new HttpError(400, "Scheduled post ID is required");
  }

  const post = await getScheduledPostById(auth.orgId, id);
  return json(post, 200);
});

export const PUT = apiHandler({ roles: ["admin", "user"] }, async ({ params, request, auth }) => {
  if (!auth.orgId) {
    throw new HttpError(403, "Your account is not linked to an organization");
  }

  const id = params.id;
  if (!id) {
    throw new HttpError(400, "Scheduled post ID is required");
  }

  const body = await readJson(request);

  const topic = typeof body.topic === "string" ? body.topic.trim() : undefined;
  const content = typeof body.content === "string" ? body.content.trim() : undefined;

  const platform = typeof body.platform === "string" && ALLOWED_PLATFORMS.includes(body.platform as Platform)
    ? (body.platform as Platform)
    : undefined;

  const status = typeof body.status === "string" && ALLOWED_STATUSES.includes(body.status as ScheduledPostStatus)
    ? (body.status as ScheduledPostStatus)
    : undefined;

  const hashtags = Array.isArray(body.hashtags)
    ? body.hashtags.filter((tag) => typeof tag === "string" && tag.startsWith("#"))
    : undefined;

  const media = sanitizeMedia(body.media);

  let scheduledTime: number | undefined;
  if (typeof body.scheduledTime === "number") {
    scheduledTime = body.scheduledTime;
  } else if (typeof body.scheduledTime === "string") {
    const parsed = Date.parse(body.scheduledTime);
    if (isNaN(parsed)) {
      throw new HttpError(400, "scheduledTime must be a valid timestamp in milliseconds or ISO 8601 string");
    }
    scheduledTime = parsed;
  }

  let timezone: string | undefined;
  if (typeof body.timezone === "string" && body.timezone.trim()) {
    timezone = body.timezone.trim();
    if (!isValidTimezone(timezone)) {
      throw new HttpError(400, `Invalid timezone: ${timezone}`);
    }
  }

  const updated = await updateScheduledPost(auth.orgId, id, {
    topic,
    platform,
    content,
    hashtags,
    media,
    scheduledTime,
    timezone,
    status,
  });

  return json(updated, 200);
});

export const DELETE = apiHandler({ roles: ["admin", "user"] }, async ({ params, auth }) => {
  if (!auth.orgId) {
    throw new HttpError(403, "Your account is not linked to an organization");
  }

  const id = params.id;
  if (!id) {
    throw new HttpError(400, "Scheduled post ID is required");
  }

  await deleteScheduledPost(auth.orgId, id);
  return json({ success: true }, 200);
});
