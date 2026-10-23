import assert from "node:assert/strict";
import {
  createScheduledPost,
  deleteScheduledPost,
  getScheduledPostById,
  isValidTimezone,
  listScheduledPosts,
  publishScheduledPost,
  updateScheduledPost,
} from "../src/lib/ai/schedule";
import { createDraft, deleteDraft, getDraftById } from "../src/lib/ai/drafts";
import type { PromptSettings } from "../src/types";

function containsEmoji(text: string): boolean {
  const emojiRegex = /[\p{Emoji_Presentation}\p{Extended_Pictographic}]/u;
  return emojiRegex.test(text);
}

async function runTests() {
  console.log("Running C3 scheduling and publishing automated tests...");

  const testOrgA = "test_org_team_c_alpha";
  const testOrgB = "test_org_team_c_beta";
  const testUserA = "test_user_alpha_01";

  // Test 1: Timezone validation utility
  assert.equal(isValidTimezone("UTC"), true, "UTC must be valid");
  assert.equal(isValidTimezone("America/New_York"), true, "America/New_York must be valid");
  assert.equal(isValidTimezone("Asia/Karachi"), true, "Asia/Karachi must be valid");
  assert.equal(isValidTimezone("Invalid/Unknown_Zone_123"), false, "Invalid timezone string must return false");
  console.log("PASS: Test 1 - Timezone validation utility");

  // Test 2: Create standalone scheduled post
  const futureSchedule = Date.now() + 86400000; // 24 hours in future
  const standalonePost = await createScheduledPost(testOrgA, testUserA, {
    topic: "Q4 Product Launch Announcement",
    platform: "twitter",
    content: "Excited to preview our upcoming enterprise capabilities next week.",
    hashtags: ["#Enterprise", "#ProductUpdate"],
    media: [{ url: "https://example.com/banner.jpg", type: "image" }],
    scheduledTime: futureSchedule,
    timezone: "America/New_York",
    status: "scheduled",
  });

  assert.ok(standalonePost.id, "Scheduled post ID must be present");
  assert.equal(standalonePost.orgId, testOrgA, "Post must belong to Org A");
  assert.equal(standalonePost.topic, "Q4 Product Launch Announcement");
  assert.equal(standalonePost.platform, "twitter");
  assert.equal(standalonePost.timezone, "America/New_York");
  assert.equal(standalonePost.status, "scheduled");
  assert.equal(standalonePost.isSimulated, false, "Post before publishing must have isSimulated false");
  assert.ok(standalonePost.scheduledIso, "Scheduled ISO string must be populated");
  assert.ok(!containsEmoji(standalonePost.content), "Content must not contain emojis");
  console.log("PASS: Test 2 - Create standalone scheduled post");

  const postId = standalonePost.id!;

  // Test 3: Create scheduled post linked to an existing C2 draft
  const promptSettings: PromptSettings = {
    topic: "Developer Platform API 2.0",
    platform: "linkedin",
    tone: "professional",
    contentType: "caption",
    language: "en",
  };

  const draft = await createDraft(testOrgA, testUserA, {
    title: "API 2.0 Developer Release",
    promptSettings,
    generatedContent: "Announcing Developer Platform API 2.0 with enhanced throughput.",
    hashtags: ["#API", "#DevTools"],
    status: "draft",
  });
  const draftId = draft.id!;

  const linkedPost = await createScheduledPost(testOrgA, testUserA, {
    draftId,
    scheduledTime: futureSchedule + 3600000,
    timezone: "UTC",
  });

  assert.equal(linkedPost.draftId, draftId, "Post must reference draftId");
  assert.equal(linkedPost.topic, "API 2.0 Developer Release", "Post must inherit draft title as topic");
  assert.equal(linkedPost.content, "Announcing Developer Platform API 2.0 with enhanced throughput.", "Post must inherit draft generatedContent");
  assert.equal(linkedPost.platform, "linkedin", "Post must inherit draft platform");

  // Verify that the linked draft's status was updated to "scheduled"
  const refreshedDraft = await getDraftById(testOrgA, draftId);
  assert.equal(refreshedDraft.status, "scheduled", "Linked draft status must transition to scheduled");
  console.log("PASS: Test 3 - Create scheduled post linked to C2 draft");

  // Test 4: List scheduled posts with organization isolation
  const listOrgA = await listScheduledPosts(testOrgA);
  assert.ok(listOrgA.some((p) => p.id === postId), "Created post must be found in Org A list");

  const listOrgB = await listScheduledPosts(testOrgB);
  assert.ok(!listOrgB.some((p) => p.id === postId), "Org A post must never appear in Org B list");

  let isolationThrew = false;
  try {
    await getScheduledPostById(testOrgB, postId);
  } catch (err: unknown) {
    isolationThrew = true;
    assert.equal((err as { status: number }).status, 404, "Cross-org access must return 404");
  }
  assert.ok(isolationThrew, "Attempting to access Org A scheduled post with Org B credentials must throw 404");
  console.log("PASS: Test 4 - List posts and verify organization isolation");

  // Test 5: Update scheduled post details and timing
  const updatedTime = futureSchedule + 7200000;
  const updated = await updateScheduledPost(testOrgA, postId, {
    topic: "Revised Q4 Launch Headline",
    content: "Refined preview of our enterprise capabilities releasing next week.",
    scheduledTime: updatedTime,
    timezone: "UTC",
    status: "scheduled",
  });

  assert.equal(updated.topic, "Revised Q4 Launch Headline");
  assert.equal(updated.scheduledTime, updatedTime);
  assert.equal(updated.timezone, "UTC");
  assert.ok(updated.updatedAt >= standalonePost.updatedAt, "Updated timestamp must be refreshed");
  console.log("PASS: Test 5 - Update scheduled post details");

  // Test 6: Simulated publishing workflow
  const publishResult = await publishScheduledPost(testOrgA, postId);
  assert.equal(publishResult.post.status, "published", "Post status must transition to published");
  assert.equal(publishResult.isSimulated, true, "isSimulated must be explicitly true");
  assert.equal(publishResult.post.isSimulated, true, "Post doc isSimulated must be true");
  assert.ok(publishResult.publishedAt > 0, "publishedAt timestamp must be recorded");
  assert.equal(publishResult.platformResponse.simulated, true, "Platform response must declare simulated: true");
  assert.ok(!containsEmoji(publishResult.platformResponse.message), "Platform message must not contain emojis");
  console.log("PASS: Test 6 - Simulated publishing workflow");

  // Test 7: Duplicate publishing prevention
  let duplicateThrew = false;
  try {
    await publishScheduledPost(testOrgA, postId);
  } catch (err: unknown) {
    duplicateThrew = true;
    assert.equal((err as { status: number }).status, 409, "Duplicate publish must throw 409 Conflict");
  }
  assert.ok(duplicateThrew, "Publishing an already published post must throw 409");
  console.log("PASS: Test 7 - Duplicate publishing prevention");

  // Test 8: Prevent editing an already published post
  let editPublishedThrew = false;
  try {
    await updateScheduledPost(testOrgA, postId, { topic: "Should Not Allow Editing" });
  } catch (err: unknown) {
    editPublishedThrew = true;
    assert.equal((err as { status: number }).status, 400, "Editing published post must throw 400 Bad Request");
  }
  assert.ok(editPublishedThrew, "Modifying published post must be rejected");
  console.log("PASS: Test 8 - Prevent modifying already published post");

  // Test 9: Cleanup and deletion
  await deleteScheduledPost(testOrgA, postId);
  let postDeleted = false;
  try {
    await getScheduledPostById(testOrgA, postId);
  } catch (err: unknown) {
    postDeleted = true;
    assert.equal((err as { status: number }).status, 404, "Deleted post must return 404");
  }
  assert.ok(postDeleted, "Scheduled post must be deleted");

  await deleteScheduledPost(testOrgA, linkedPost.id!);
  await deleteDraft(testOrgA, draftId);
  console.log("PASS: Test 9 - Cleanup and deletion");

  console.log("\nAll 9 C3 tests completed successfully.");
}

runTests().catch((err) => {
  console.error("Test failure:", err);
  process.exit(1);
});
