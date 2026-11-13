// Scheduling and publishing service layer for Team C
// Manages scheduled posts in Firestore with live social and simulated publishing

import { getAdminDb } from "@/lib/firebaseAdmin";
import { HttpError } from "@/lib/errors";
import { getDraftById, updateDraft } from "@/lib/ai/drafts";
import { isInstagramConfigured, publishToInstagram } from "@/lib/ai/instagram";
import { isFacebookConfigured, publishToFacebookPage } from "@/lib/ai/facebook";
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
const DEFAULT_INSTAGRAM_IMAGE =
  "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=1080&q=80";

// Validate an IANA timezone identifier such as UTC or America/New_York
export function isValidTimezone(tz: string): boolean {
  if (!tz || typeof tz !== "string") return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// Strip undefined properties before writing to Firestore
function sanitizeDoc<T>(doc: T): T {
  return JSON.parse(JSON.stringify(doc));
}

// Build full Instagram caption including hashtags if present
function buildPostCaption(content: string, hashtags: string[]): string {
  const cleanTags = Array.isArray(hashtags) ? hashtags.filter(Boolean) : [];
  if (cleanTags.length === 0) return content;
  return `${content}\n\n${cleanTags.join(" ")}`;
}

// Create and persist a scheduled post, inheriting details if draftId is supplied
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

  if (input.draftId) {
    const draft = await getDraftById(orgId, input.draftId);
    if (!topic) topic = draft.title;
    if (!input.platform) platform = draft.promptSettings.platform;
    if (!content) content = draft.generatedContent;
    if (hashtags.length === 0 && Array.isArray(draft.hashtags)) hashtags = draft.hashtags;
    if (media.length === 0 && Array.isArray(draft.media)) media = draft.media;

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

// List scheduled posts for an organization sorted chronologically
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

  posts.sort((a, b) => a.scheduledTime - b.scheduledTime);
  return posts;
}

// Fetch a single scheduled post while enforcing organization ownership
export async function getScheduledPostById(
  orgId: string,
  postId: string
): Promise<ScheduledPostDoc> {
  const db = getAdminDb();
  const snap = await db.collection(COLLECTION_NAME).doc(postId).get();

  if (!snap.exists) {
    throw new HttpError(404, "Scheduled post not found");
  }

  const data = snap.data() as Omit<ScheduledPostDoc, "id">;
  if (data.orgId !== orgId) {
    throw new HttpError(404, "Scheduled post not found");
  }

  return { id: snap.id, ...data };
}

// Update an unpublished scheduled post
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

// Delete a scheduled post belonging to the caller organization
export async function deleteScheduledPost(orgId: string, postId: string): Promise<void> {
  await getScheduledPostById(orgId, postId);
  await getAdminDb().collection(COLLECTION_NAME).doc(postId).delete();
}

// Execute a live platform publish callback and persist success or failure in Firestore
async function executeLivePublish(
  postId: string,
  existing: ScheduledPostDoc,
  now: number,
  publishFn: () => Promise<{ externalId: string; message: string }>
): Promise<PublishPostResult> {
  try {
    const result = await publishFn();

    const livePatch: Partial<ScheduledPostDoc> = {
      status: "published",
      isSimulated: false,
      externalId: result.externalId,
      publishedAt: now,
      updatedAt: now,
      failureReason: undefined,
    };

    const cleanLivePatch = sanitizeDoc(livePatch);
    await getAdminDb().collection(COLLECTION_NAME).doc(postId).update(cleanLivePatch);

    const updatedPost: ScheduledPostDoc = {
      ...existing,
      ...cleanLivePatch,
      id: postId,
    };

    return {
      post: updatedPost,
      isSimulated: false,
      publishedAt: now,
      platformResponse: {
        success: true,
        simulated: false,
        message: result.message,
        externalId: result.externalId,
      },
    };
  } catch (err) {
    const reason = (err as Error).message || "Social publishing failed";
    const failPatch = sanitizeDoc({
      status: "failed" as ScheduledPostStatus,
      failureReason: reason,
      updatedAt: now,
    });
    await getAdminDb().collection(COLLECTION_NAME).doc(postId).update(failPatch);

    throw err instanceof HttpError ? err : new HttpError(502, reason);
  }
}

// Publish a post to live Instagram or Facebook when configured, or fall back to simulation
export async function publishScheduledPost(
  orgId: string,
  postId: string
): Promise<PublishPostResult> {
  const existing = await getScheduledPostById(orgId, postId);

  if (existing.status === "published") {
    throw new HttpError(409, "Post has already been published and cannot be republished");
  }

  const now = Date.now();
  const caption = buildPostCaption(existing.content, existing.hashtags);

  if (existing.platform === "instagram" && isInstagramConfigured()) {
    const imageUrl = existing.media?.[0]?.url || DEFAULT_INSTAGRAM_IMAGE;
    return executeLivePublish(postId, existing, now, () =>
      publishToInstagram({ caption, imageUrl })
    );
  }

  if (existing.platform === "facebook" && isFacebookConfigured()) {
    const imageUrl = existing.media?.[0]?.url;
    return executeLivePublish(postId, existing, now, () =>
      publishToFacebookPage({ message: caption, imageUrl })
    );
  }

  // Simulated publishing fallback when live credentials are not configured
  const isSimulated = true;
  const externalId = `sim_${existing.platform}_${now}_${Math.random().toString(36).substring(2, 8)}`;
  const platformResponse = {
    success: true,
    simulated: true,
    message: `Post successfully published to ${existing.platform} via simulated gateway`,
    externalId,
  };

  const patch: Partial<ScheduledPostDoc> = {
    status: "published",
    isSimulated,
    externalId,
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

// Check for scheduled posts whose scheduledTime has arrived and publish them
export async function processDueScheduledPosts(orgId: string): Promise<{
  processedCount: number;
  publishedIds: string[];
  failed: Array<{ id: string; error: string }>;
}> {
  const scheduledPosts = await listScheduledPosts(orgId, "scheduled");
  const now = Date.now();
  const duePosts = scheduledPosts.filter((post) => post.id && post.scheduledTime <= now);

  const publishedIds: string[] = [];
  const failed: Array<{ id: string; error: string }> = [];

  for (const post of duePosts) {
    if (!post.id) continue;
    try {
      await publishScheduledPost(orgId, post.id);
      publishedIds.push(post.id);
    } catch (err) {
      failed.push({
        id: post.id,
        error: (err as Error).message || "Failed to publish scheduled post",
      });
    }
  }

  return {
    processedCount: duePosts.length,
    publishedIds,
    failed,
  };
}
