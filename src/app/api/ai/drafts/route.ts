// /api/ai/drafts
// GET:  List drafts belonging to the caller's organization (supports ?status= filter)
// POST: Save a new draft to the library

import { apiHandler, json, preflight } from "@/lib/api";
import { HttpError } from "@/lib/errors";
import { readJson, requireString } from "@/lib/validate";
import { createDraft, listDrafts } from "@/lib/ai/drafts";
import type {
  ContentType,
  DraftStatus,
  MediaReference,
  Platform,
  PromptSettings,
  Tone,
} from "@/types";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

const ALLOWED_CONTENT_TYPES: readonly ContentType[] = [
  "caption",
  "product_description",
  "hashtags",
  "campaign_ideas",
];

const ALLOWED_PLATFORMS: readonly Platform[] = [
  "instagram",
  "twitter",
  "linkedin",
  "facebook",
  "general",
];

const ALLOWED_TONES: readonly Tone[] = [
  "professional",
  "casual",
  "excited",
  "witty",
  "urgent",
  "informative",
];

const ALLOWED_STATUSES: readonly DraftStatus[] = [
  "draft",
  "reviewed",
  "scheduled",
  "archived",
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
  const filterStatus = statusParam && ALLOWED_STATUSES.includes(statusParam as DraftStatus)
    ? (statusParam as DraftStatus)
    : undefined;

  const drafts = await listDrafts(auth.orgId, filterStatus);
  return json(drafts, 200);
});

export const POST = apiHandler({ roles: ["admin", "user"] }, async ({ request, auth }) => {
  if (!auth.orgId) {
    throw new HttpError(403, "Your account is not linked to an organization");
  }

  const body = await readJson(request);

  const rawPrompt = body.promptSettings;
  if (typeof rawPrompt !== "object" || rawPrompt === null) {
    throw new HttpError(400, "promptSettings is required");
  }

  const promptRecord = rawPrompt as Record<string, unknown>;
  const topic = typeof promptRecord.topic === "string" ? promptRecord.topic.trim() : "";
  if (!topic || topic.length < 2) {
    throw new HttpError(400, "promptSettings.topic must be at least 2 characters");
  }

  const contentType = promptRecord.contentType as ContentType;
  if (!ALLOWED_CONTENT_TYPES.includes(contentType)) {
    throw new HttpError(400, `promptSettings.contentType must be one of: ${ALLOWED_CONTENT_TYPES.join(", ")}`);
  }

  const platform = ALLOWED_PLATFORMS.includes(promptRecord.platform as Platform)
    ? (promptRecord.platform as Platform)
    : "general";

  const tone = ALLOWED_TONES.includes(promptRecord.tone as Tone)
    ? (promptRecord.tone as Tone)
    : "professional";

  const promptSettings: PromptSettings = {
    topic,
    contentType,
    platform,
    tone,
    language: typeof promptRecord.language === "string" ? promptRecord.language.trim() : "en",
    targetAudience: typeof promptRecord.targetAudience === "string" ? promptRecord.targetAudience.trim() : undefined,
  };

  const generatedContent = requireString(body, "generatedContent", { min: 1, max: 10000 });
  const title = typeof body.title === "string" && body.title.trim() ? body.title.trim() : topic;
  const status = ALLOWED_STATUSES.includes(body.status as DraftStatus) ? (body.status as DraftStatus) : "draft";

  const hashtags = Array.isArray(body.hashtags)
    ? body.hashtags.filter((tag) => typeof tag === "string" && tag.startsWith("#"))
    : [];

  const media = sanitizeMedia(body.media);
  const providerUsed = body.providerUsed === "gemini" ? "gemini" : "mock";

  const draft = await createDraft(auth.orgId, auth.uid, {
    title,
    promptSettings,
    generatedContent,
    hashtags,
    status,
    media,
    providerUsed,
  });

  return json(draft, 201);
});
