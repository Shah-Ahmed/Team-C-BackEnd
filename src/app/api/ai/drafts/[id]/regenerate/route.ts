// POST /api/ai/drafts/:id/regenerate
// Re-generates draft copy using saved prompt settings and increments version.

import { apiHandler, json, preflight } from "@/lib/api";
import { HttpError } from "@/lib/errors";
import { regenerateDraftContent } from "@/lib/ai/drafts";
import type { Platform, PromptSettings, Tone } from "@/types";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

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

export const POST = apiHandler({ roles: ["admin", "user"] }, async ({ params, request, auth }) => {
  if (!auth.orgId) {
    throw new HttpError(403, "Your account is not linked to an organization");
  }

  const id = params.id;
  if (!id) {
    throw new HttpError(400, "Draft ID is required");
  }

  let overrides: Partial<PromptSettings> | undefined;

  try {
    const text = await request.text();
    if (text.trim().length > 0) {
      const parsed = JSON.parse(text) as Record<string, unknown>;
      overrides = {};

      if (typeof parsed.tone === "string" && ALLOWED_TONES.includes(parsed.tone as Tone)) {
        overrides.tone = parsed.tone as Tone;
      }
      if (typeof parsed.platform === "string" && ALLOWED_PLATFORMS.includes(parsed.platform as Platform)) {
        overrides.platform = parsed.platform as Platform;
      }
      if (typeof parsed.targetAudience === "string") {
        overrides.targetAudience = parsed.targetAudience.trim() || undefined;
      }
    }
  } catch {
    // If empty body or invalid json, proceed with no overrides (reuse existing draft settings)
  }

  const updatedDraft = await regenerateDraftContent(auth.orgId, id, overrides);
  return json(updatedDraft, 200);
});
