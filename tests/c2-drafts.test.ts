import assert from "node:assert/strict";
import {
  createDraft,
  deleteDraft,
  getDraftById,
  listDrafts,
  regenerateDraftContent,
  updateDraft,
} from "../src/lib/ai/drafts";
import type { PromptSettings } from "../src/types";

function containsEmoji(text: string): boolean {
  const emojiRegex = /[\p{Emoji_Presentation}\p{Extended_Pictographic}]/u;
  return emojiRegex.test(text);
}

async function runTests() {
  console.log("Running C2 draft management automated tests...");

  const testOrgA = "test_org_team_c_alpha";
  const testOrgB = "test_org_team_c_beta";
  const testUserA = "test_user_alpha_01";

  const promptSettings: PromptSettings = {
    topic: "Smart Home Security System",
    platform: "linkedin",
    tone: "professional",
    contentType: "caption",
    language: "en",
    targetAudience: "Property managers",
  };

  // Test 1: Create draft
  const draft = await createDraft(testOrgA, testUserA, {
    title: "Security System Launch Post",
    promptSettings,
    generatedContent: "Advanced security protocols designed for comprehensive facility protection.",
    hashtags: ["#Security", "#SmartHome", "#FacilityManagement"],
    status: "draft",
    media: [{ url: "https://example.com/system.jpg", type: "image", altText: "Security hub" }],
    providerUsed: "mock",
  });

  assert.ok(draft.id, "Draft ID must be assigned");
  assert.equal(draft.orgId, testOrgA, "Draft must belong to org A");
  assert.equal(draft.createdBy, testUserA, "Draft createdBy must match");
  assert.equal(draft.version, 1, "Initial version must be 1");
  assert.ok(!containsEmoji(draft.generatedContent), "Draft content must not contain emojis");
  console.log("PASS: Test 1 - Create draft");

  const draftId = draft.id!;

  // Test 2: List drafts for organization
  const draftsList = await listDrafts(testOrgA);
  assert.ok(draftsList.length > 0, "List must return at least one draft");
  const found = draftsList.find((d) => d.id === draftId);
  assert.ok(found, "Created draft must be present in organization draft list");
  console.log("PASS: Test 2 - List drafts for organization");

  // Test 3: Multi-tenant isolation test
  const draftsForOrgB = await listDrafts(testOrgB);
  const foundInOrgB = draftsForOrgB.find((d) => d.id === draftId);
  assert.ok(!foundInOrgB, "Draft from Org A must never appear in Org B list");

  let isolationThrew = false;
  try {
    await getDraftById(testOrgB, draftId);
  } catch (err: unknown) {
    isolationThrew = true;
    assert.equal((err as { status: number }).status, 404, "Access from other org must return 404");
  }
  assert.ok(isolationThrew, "Attempting to access Org A draft with Org B credentials must throw 404");
  console.log("PASS: Test 3 - Multi-tenant isolation check");

  // Test 4: Update draft
  const updated = await updateDraft(testOrgA, draftId, {
    title: "Updated Security System Announcement",
    status: "reviewed",
    generatedContent: "Enhanced protection protocols for high-density modern residential developments.",
  });
  assert.equal(updated.title, "Updated Security System Announcement");
  assert.equal(updated.status, "reviewed");
  assert.equal(updated.generatedContent, "Enhanced protection protocols for high-density modern residential developments.");
  assert.ok(updated.updatedAt >= draft.updatedAt, "Updated timestamp must be refreshed");
  console.log("PASS: Test 4 - Update draft");

  // Test 5: Regenerate draft content
  const regenerated = await regenerateDraftContent(testOrgA, draftId, {
    tone: "urgent",
  });
  assert.equal(regenerated.promptSettings.tone, "urgent", "Tone override should be applied");
  assert.equal(regenerated.version, 2, "Regenerated draft version must increment to 2");
  assert.ok(regenerated.generatedContent.length > 10, "Regenerated content must not be empty");
  assert.ok(!containsEmoji(regenerated.generatedContent), "Regenerated content must not contain emojis");
  console.log("PASS: Test 5 - Regenerate draft content");

  // Test 6: Delete draft
  await deleteDraft(testOrgA, draftId);
  let deleteVerified = false;
  try {
    await getDraftById(testOrgA, draftId);
  } catch (err: unknown) {
    deleteVerified = true;
    assert.equal((err as { status: number }).status, 404, "Deleted draft must return 404");
  }
  assert.ok(deleteVerified, "Draft must no longer exist after deletion");
  console.log("PASS: Test 6 - Delete draft");


  console.log("\nAll 6 C2 tests completed successfully.");
}

runTests().catch((err) => {
  console.error("Test failure:", err);
  process.exit(1);
});
