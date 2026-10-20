// Draft and creative library data access layer for Team C.
// Manages the aiContentDrafts Firestore collection with multi-tenant isolation.

import { getAdminDb } from "@/lib/firebaseAdmin";
import { HttpError } from "@/lib/errors";
import { generateAiContent } from "@/lib/ai/generator";
import type {
  AiContentDraftDoc,
  DraftStatus,
  MediaReference,
  PromptSettings,
} from "@/types";

const COLLECTION_NAME = "aiContentDrafts";

export interface CreateDraftInput {
  title?: string;
  promptSettings: PromptSettings;
  generatedContent: string;
  hashtags?: string[];
  status?: DraftStatus;
  media?: MediaReference[];
  providerUsed?: "gemini" | "mock";
}

export interface UpdateDraftInput {
  title?: string;
  generatedContent?: string;
  hashtags?: string[];
  status?: DraftStatus;
  media?: MediaReference[];
}

/**
 * Creates and persists a new draft associated with an organization and user.
 */
export async function createDraft(
  orgId: string,
  createdBy: string,
  input: CreateDraftInput
): Promise<AiContentDraftDoc> {
  const db = getAdminDb();

  const now = Date.now();

  const title = input.title?.trim() || input.promptSettings.topic.trim();
  const hashtags = Array.isArray(input.hashtags) ? input.hashtags : [];
  const media = Array.isArray(input.media) ? input.media : [];
  const status: DraftStatus = input.status || "draft";
  const providerUsed = input.providerUsed || "mock";

  const draftData: Omit<AiContentDraftDoc, "id"> = {
    orgId,
    createdBy,
    title,
    promptSettings: input.promptSettings,
    generatedContent: input.generatedContent,
    hashtags,
    status,
    media,
    providerUsed,
    version: 1,
    createdAt: now,
    updatedAt: now,
  };

  const cleanedData: Omit<AiContentDraftDoc, "id"> = JSON.parse(JSON.stringify(draftData));
  const docRef = await db.collection(COLLECTION_NAME).add(cleanedData);
  return { id: docRef.id, ...cleanedData };
}

/**
 * Lists all drafts for an organization, ordered by latest update.
 */
export async function listDrafts(
  orgId: string,
  filterStatus?: DraftStatus
): Promise<AiContentDraftDoc[]> {
  const db = getAdminDb();
  let query = db.collection(COLLECTION_NAME).where("orgId", "==", orgId);

  if (filterStatus) {
    query = query.where("status", "==", filterStatus);
  }

  const snapshot = await query.get();

  const drafts = snapshot.docs.map((doc) => {
    const data = doc.data() as Omit<AiContentDraftDoc, "id">;
    return { id: doc.id, ...data };
  });

  drafts.sort((a, b) => b.updatedAt - a.updatedAt);
  return drafts;
}

/**
 * Retrieves a single draft by ID, validating that it belongs to the caller's organization.
 */
export async function getDraftById(orgId: string, draftId: string): Promise<AiContentDraftDoc> {
  const db = getAdminDb();
  const snap = await db.collection(COLLECTION_NAME).doc(draftId).get();

  // Return 404 for missing and cross-org access to prevent tenant record enumeration.
  if (!snap.exists) {
    throw new HttpError(404, "Draft not found");
  }

  const data = snap.data() as Omit<AiContentDraftDoc, "id">;
  if (data.orgId !== orgId) {
    throw new HttpError(404, "Draft not found");
  }

  return { id: snap.id, ...data };
}

/**
 * Updates editable fields on a draft and refreshes the updatedAt timestamp.
 */
export async function updateDraft(
  orgId: string,
  draftId: string,
  updates: UpdateDraftInput
): Promise<AiContentDraftDoc> {
  const existing = await getDraftById(orgId, draftId);
  const now = Date.now();

  const patch: Partial<AiContentDraftDoc> = {
    updatedAt: now,
  };

  if (updates.title !== undefined) patch.title = updates.title.trim();
  if (updates.generatedContent !== undefined) patch.generatedContent = updates.generatedContent.trim();
  if (updates.hashtags !== undefined) patch.hashtags = updates.hashtags;
  if (updates.status !== undefined) patch.status = updates.status;
  if (updates.media !== undefined) patch.media = updates.media;

  await getAdminDb().collection(COLLECTION_NAME).doc(draftId).update(patch);
  return { ...existing, ...patch, id: draftId };
}

/**
 * Permanently deletes a draft belonging to the caller's organization.
 */
export async function deleteDraft(orgId: string, draftId: string): Promise<void> {
  await getDraftById(orgId, draftId);
  await getAdminDb().collection(COLLECTION_NAME).doc(draftId).delete();
}

/**
 * Re-runs AI generation for an existing draft, increments version, and saves the update.
 */
export async function regenerateDraftContent(
  orgId: string,
  draftId: string,
  overrides?: Partial<PromptSettings>
): Promise<AiContentDraftDoc> {
  const existing = await getDraftById(orgId, draftId);


  const effectiveSettings: PromptSettings = {
    ...existing.promptSettings,
    ...(overrides || {}),
  };

  const generated = await generateAiContent(effectiveSettings);
  const now = Date.now();

  const patch: Partial<AiContentDraftDoc> = {
    promptSettings: effectiveSettings,
    generatedContent: generated.content,
    hashtags: generated.hashtags,
    providerUsed: generated.provider,
    version: (existing.version || 1) + 1,
    updatedAt: now,
  };

  await getAdminDb().collection(COLLECTION_NAME).doc(draftId).update(patch);
  return { ...existing, ...patch, id: draftId };
}
