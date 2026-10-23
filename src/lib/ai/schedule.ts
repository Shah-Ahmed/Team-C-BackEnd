// Scheduling and publishing workflow data access layer for Team C.
// Manages the aiScheduledPosts Firestore collection with multi-tenant isolation,
// timezone-aware scheduling, status lifecycle transitions, and simulated publishing.

import { getAdminDb } from "@/lib/firebaseAdmin";
import { HttpError } from "@/lib/errors";
import { getDraftById, updateDraft } from "@/lib/ai/drafts";
import type {
  CreateScheduledPostInput,
  MediaReference,
  Platform,
  PublishPostResult,
  ScheduledPostDoc,
  ScheduledPostStatus,
  UpdateScheduledPostInput,
} from "@/types";

const COLLECTION_NAME = "aiScheduledPosts";

/**
 * Validates an IANA timezone identifier (e.g. "UTC", "America/New_York").
 */
export function isValidTimezone(tz: string): boolean {
  if (!tz || typeof tz !== "string") return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Strips undefined values to prevent Firestore serialization exceptions.
 */
function sanitizeDoc<T>(doc: T): T {
  return JSON.parse(JSON.stringify(doc));
}

/**
 * Creates and persists a new scheduled post for an organization.
 * If draftId is supplied, content and media are inherited from the draft,
 * and the draft's status is linked and updated to "scheduled".
 */
export async function createScheduledPost(
  orgId: string,
  createdBy: string,
  input: CreateScheduledPostInput
): Promise<ScheduledPostDoc> {
  const db = getAdminDb();
  const now = Date.now();

  let topic = input.topic?.trim() || "";
  let platform: Platform = input.platform || "general";
  let content = input.content?.trim() || "";
  let hashtags: string[] = Array.isArray(input.hashtags) ? input.hashtags : [];
  let media: MediaReference[] = Array.isArray(input.media) ? input.media : [];

  // If created from an existing draft, verify ownership and inherit details
  if (input.draftId) {
    const draft = await getDraftById(orgId, input.draftId);
    if (!topic) topic = draft.title;
    if (!input.platform) platform = draft.promptSettings.platform;
    if (!content) content = draft.generatedContent;
    if (hashtags.length === 0 && Array.isArray(draft.hashtags)) hashtags = draft.hashtags;
    if (media.length === 0 && Array.isArray(draft.media)) media = draft.media;

    // Transition linked draft to scheduled status
    await updateDraft(orgId, input.draftId, { status: "scheduled" });
  }

  if (!topic) {
    throw new HttpError(400, "Topic or title is required for a scheduled post");
  }

  if (!content) {
    throw new HttpError(400, "Post content is required for a scheduled post");
  }

  if (typeof input.scheduledTime !== "number" || isNaN(input.scheduledTime) || input.scheduledTime <= 0) {
    throw new HttpError(400, "A valid scheduledTime timestamp in milliseconds is required");
  }

  const timezone = input.timezone?.trim() || "UTC";
  if (!isValidTimezone(timezone)) {
    throw new HttpError(400, `Invalid timezone: ${timezone}. Use an IANA timezone identifier such as UTC or America/New_York`);
  }

  const status: ScheduledPostStatus = input.status || "scheduled";

  const scheduledIso = new Date(input.scheduledTime).toISOString();

  const postData: Omit<ScheduledPostDoc, "id"> = {
    orgId,
    createdBy,
    ...(input.draftId ? { draftId: input.draftId } : {}),
    topic,
    platform,
    content,
    hashtags,
    media,
    scheduledTime: input.scheduledTime,
    scheduledIso,
    timezone,
    status,
    isSimulated: false,
    createdAt: now,
    updatedAt: now,
  };

  const clean = sanitizeDoc(postData);
  const docRef = await db.collection(COLLECTION_NAME).add(clean);
  return { id: docRef.id, ...clean };
}

/**
 * Lists scheduled posts for an organization with optional status and platform filters.
 * Sorted chronologically by scheduledTime.
 */
export async function listScheduledPosts(
  orgId: string,
  filterStatus?: ScheduledPostStatus,
  filterPlatform?: Platform
): Promise<ScheduledPostDoc[]> {
  const db = getAdminDb();
  let query = db.collection(COLLECTION_NAME).where("orgId", "==", orgId);

  if (filterStatus) {
    query = query.where("status", "==", filterStatus);
  }
  if (filterPlatform) {
    query = query.where("platform", "==", filterPlatform);
  }

  const snapshot = await query.get();

  const posts = snapshot.docs.map((doc) => {
    const data = doc.data() as Omit<ScheduledPostDoc, "id">;
    return { id: doc.id, ...data };
  });

  // Sort ascending by scheduledTime for calendar/queue display
  posts.sort((a, b) => a.scheduledTime - b.scheduledTime);
  return posts;
}

/**
 * Retrieves a single scheduled post, enforcing organization-level isolation.
 */
export async function getScheduledPostById(
  orgId: string,
  postId: string
): Promise<ScheduledPostDoc> {
  const db = getAdminDb();
  const snap = await db.collection(COLLECTION_NAME).doc(postId).get();

  // Return 404 for missing or cross-org access to prevent ID enumeration
  if (!snap.exists) {
    throw new HttpError(404, "Scheduled post not found");
  }

  const data = snap.data() as Omit<ScheduledPostDoc, "id">;
  if (data.orgId !== orgId) {
    throw new HttpError(404, "Scheduled post not found");
  }

  return { id: snap.id, ...data };
}

/**
 * Updates scheduling details and content of an existing scheduled post.
 * If the post has already been published, modifications are disallowed.
 */
export async function updateScheduledPost(
  orgId: string,
  postId: string,
  updates: UpdateScheduledPostInput
): Promise<ScheduledPostDoc> {
  const existing = await getScheduledPostById(orgId, postId);

  if (existing.status === "published") {
    throw new HttpError(400, "Published posts cannot be rescheduled or modified");
  }

  const now = Date.now();
  const patch: Partial<ScheduledPostDoc> = {
    updatedAt: now,
  };

  if (updates.topic !== undefined) patch.topic = updates.topic.trim();
  if (updates.platform !== undefined) patch.platform = updates.platform;
  if (updates.content !== undefined) patch.content = updates.content.trim();
  if (updates.hashtags !== undefined) patch.hashtags = updates.hashtags;
  if (updates.media !== undefined) patch.media = updates.media;

  if (updates.scheduledTime !== undefined) {
    if (typeof updates.scheduledTime !== "number" || isNaN(updates.scheduledTime) || updates.scheduledTime <= 0) {
      throw new HttpError(400, "scheduledTime must be a valid positive timestamp in milliseconds");
    }
    patch.scheduledTime = updates.scheduledTime;
    patch.scheduledIso = new Date(updates.scheduledTime).toISOString();
  }

  if (updates.timezone !== undefined) {
    const tz = updates.timezone.trim();
    if (!isValidTimezone(tz)) {
      throw new HttpError(400, `Invalid timezone: ${tz}`);
    }
    patch.timezone = tz;
  }

  if (updates.status !== undefined) {
    if (updates.status === "published") {
      throw new HttpError(400, "Use the /publish endpoint to publish a post");
    }
    patch.status = updates.status;
  }

  const cleanPatch = sanitizeDoc(patch);
  await getAdminDb().collection(COLLECTION_NAME).doc(postId).update(cleanPatch);
  return { ...existing, ...cleanPatch, id: postId };
}

/**
 * Cancels and deletes a scheduled post belonging to the caller's organization.
 */
export async function deleteScheduledPost(orgId: string, postId: string): Promise<void> {
  await getScheduledPostById(orgId, postId);
  await getAdminDb().collection(COLLECTION_NAME).doc(postId).delete();
}

/**
 * Publishes a scheduled post.
 *
 * Prevents duplicate publishing if already in "published" status.
 * Evaluates real external publishing integration if credentials exist,
 * and executes a safe simulated publication if real platform APIs are not configured.
 * Clearly records isSimulated: true to avoid misleading reporting.
 */
export async function publishScheduledPost(
  orgId: string,
  postId: string
): Promise<PublishPostResult> {
  const existing = await getScheduledPostById(orgId, postId);

  // Prevent duplicate publishing
  if (existing.status === "published") {
    throw new HttpError(409, "Post has already been published and cannot be republished");
  }

  const now = Date.now();

  // Check if real platform credentials exist (e.g. Meta Graph, Twitter API)
  const hasRealPlatformCredentials = Boolean(
    process.env.ENABLE_REAL_PUBLISHING === "true" &&
    process.env.SOCIAL_PUBLISHING_API_KEY
  );

  if (hasRealPlatformCredentials) {
    // Real publishing integration branch: Only used if valid credentials exist.
    // In this collaborative internship repo, real platform credentials are not provided.
    throw new HttpError(501, "Real external social platform publishing credentials are not configured");
  }

  // Simulated publishing engine:
  // Clearly distinguish simulation from real external publishing.
  const isSimulated = true;
  const platformResponse = {
    success: true,
    simulated: true,
    message: `Post successfully published to ${existing.platform} via simulated gateway`,
    externalId: `sim_${existing.platform}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
  };

  const patch: Partial<ScheduledPostDoc> = {
    status: "published",
    isSimulated,
    publishedAt: now,
    updatedAt: now,
    failureReason: undefined,
  };

  const cleanPatch = sanitizeDoc(patch);
  await getAdminDb().collection(COLLECTION_NAME).doc(postId).update(cleanPatch);

  const updatedPost: ScheduledPostDoc = {
    ...existing,
    ...cleanPatch,
    id: postId,
  };

  return {
    post: updatedPost,
    isSimulated,
    publishedAt: now,
    platformResponse,
  };
}
