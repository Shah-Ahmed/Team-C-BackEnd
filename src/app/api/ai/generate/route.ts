// POST /api/ai/generate
// Generates social media copy and hashtags for authenticated users of an organization.

import { apiHandler, json, preflight } from "@/lib/api";
import { HttpError } from "@/lib/errors";
import { optionalString, readJson, requireEnum, requireString } from "@/lib/validate";
import { generateAiContent } from "@/lib/ai/generator";
import type { ContentType, Platform, PromptSettings, Tone } from "@/types";

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

export const POST = apiHandler({ roles: ["admin", "user"] }, async ({ request, auth }) => {
  if (!auth.orgId) {
    throw new HttpError(403, "Your account is not linked to an organization");
  }

  const body = await readJson(request);

  const topic = requireString(body, "topic", { min: 2, max: 500 });
  const contentType = requireEnum(body, "contentType", ALLOWED_CONTENT_TYPES);
  const platform = requireEnum(body, "platform", ALLOWED_PLATFORMS, "general");
  const tone = requireEnum(body, "tone", ALLOWED_TONES, "professional");
  const language = optionalString(body, "language", { max: 50 }) || "en";
  const targetAudience = optionalString(body, "targetAudience", { max: 200 });

  const promptSettings: PromptSettings = {
    topic,
    platform,
    tone,
    contentType,
    language,
    targetAudience,
  };

  const result = await generateAiContent(promptSettings);

  return json(result, 200);
});
