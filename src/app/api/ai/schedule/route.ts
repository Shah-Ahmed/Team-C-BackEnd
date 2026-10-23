// /api/ai/schedule
// GET:  List scheduled posts for the caller's organization
// POST: Create a scheduled post (standalone or linked to a draft)

import { apiHandler, json, preflight } from "@/lib/api";
import { HttpError } from "@/lib/errors";
import { readJson } from "@/lib/validate";
import { createScheduledPost, isValidTimezone, listScheduledPosts } from "@/lib/ai/schedule";
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
  "published",
  "failed",
];

function sanitizeMedia(rawMedia: unknown): MediaReference[] {
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

export const GET = apiHandler({ roles: ["admin", "user"] }, async ({ request, auth }) => {
  if (!auth.orgId) {
    throw new HttpError(403, "Your account is not linked to an organization");
  }

  const url = new URL(request.url);
  const statusParam = url.searchParams.get("status");
  const platformParam = url.searchParams.get("platform");

  const filterStatus = statusParam && ALLOWED_STATUSES.includes(statusParam as ScheduledPostStatus)
    ? (statusParam as ScheduledPostStatus)
    : undefined;

  const filterPlatform = platformParam && ALLOWED_PLATFORMS.includes(platformParam as Platform)
    ? (platformParam as Platform)
    : undefined;

  const posts = await listScheduledPosts(auth.orgId, filterStatus, filterPlatform);
  return json(posts, 200);
});

export const POST = apiHandler({ roles: ["admin", "user"] }, async ({ request, auth }) => {
  if (!auth.orgId) {
    throw new HttpError(403, "Your account is not linked to an organization");
  }

  const body = await readJson(request);

  const draftId = typeof body.draftId === "string" && body.draftId.trim() ? body.draftId.trim() : undefined;
  const topic = typeof body.topic === "string" ? body.topic.trim() : undefined;
  const content = typeof body.content === "string" ? body.content.trim() : undefined;

  const platform = typeof body.platform === "string" && ALLOWED_PLATFORMS.includes(body.platform as Platform)
    ? (body.platform as Platform)
    : undefined;

  const status = typeof body.status === "string" && ALLOWED_STATUSES.includes(body.status as ScheduledPostStatus)
    ? (body.status as ScheduledPostStatus)
    : "scheduled";

  const hashtags = Array.isArray(body.hashtags)
    ? body.hashtags.filter((tag) => typeof tag === "string" && tag.startsWith("#"))
    : undefined;

  const media = sanitizeMedia(body.media);

  // Timezone-aware timestamp validation
  // Expecting scheduledTime in epoch milliseconds
  let scheduledTime: number;
  if (typeof body.scheduledTime === "number") {
    scheduledTime = body.scheduledTime;
  } else if (typeof body.scheduledTime === "string") {
    const parsed = Date.parse(body.scheduledTime);
    if (isNaN(parsed)) {
      throw new HttpError(400, "scheduledTime must be a valid timestamp in milliseconds or ISO 8601 string");
    }
    scheduledTime = parsed;
  } else {
    throw new HttpError(400, "scheduledTime is required");
  }

  const timezone = typeof body.timezone === "string" && body.timezone.trim() ? body.timezone.trim() : "UTC";
  if (!isValidTimezone(timezone)) {
    throw new HttpError(400, `Invalid timezone: ${timezone}. Please provide an IANA timezone identifier such as UTC`);
  }

  const post = await createScheduledPost(auth.orgId, auth.uid, {
    draftId,
    topic,
    platform,
    content,
    hashtags,
    media,
    scheduledTime,
    timezone,
    status,
  });

  return json(post, 201);
});
