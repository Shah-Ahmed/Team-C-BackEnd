import assert from "node:assert/strict";
import { generateAiContent } from "../src/lib/ai/generator";
import type { PromptSettings } from "../src/types";

function containsEmoji(text: string): boolean {
  const emojiRegex = /[\p{Emoji_Presentation}\p{Extended_Pictographic}]/u;
  return emojiRegex.test(text);
}

async function runTests() {
  console.log("Running C1 AI generator automated tests...");

  // Test 1: Caption generation
  const captionSettings: PromptSettings = {
    topic: "Wireless Noise Cancelling Headphones",
    platform: "instagram",
    tone: "excited",
    contentType: "caption",
    language: "en",
    targetAudience: "Commuters and students",
  };
  const captionResult = await generateAiContent(captionSettings);
  assert.ok(captionResult.content.length > 20, "Caption should not be empty");
  assert.ok(Array.isArray(captionResult.hashtags), "Hashtags should be an array");
  assert.ok(captionResult.hashtags.length > 0, "Hashtags should contain tags");
  assert.ok(["gemini", "mock"].includes(captionResult.provider), "Provider must be gemini or mock");
  assert.ok(!containsEmoji(captionResult.content), "Generated caption must not contain emojis");
  console.log("PASS: Test 1 - Caption generation");

  // Test 2: Product description generation
  const productSettings: PromptSettings = {
    topic: "Ergonomic Mechanical Keyboard",
    platform: "general",
    tone: "professional",
    contentType: "product_description",
    language: "en",
  };
  const productResult = await generateAiContent(productSettings);
  assert.ok(productResult.content.includes("Overview:"), "Product description should include Overview");
  assert.ok(productResult.content.includes("Specifications:"), "Product description should include Specifications");
  assert.ok(!containsEmoji(productResult.content), "Product description must not contain emojis");
  console.log("PASS: Test 2 - Product description generation");

  // Test 3: Hashtags generation
  const hashtagsSettings: PromptSettings = {
    topic: "Sustainable Bamboo Cutlery",
    platform: "twitter",
    tone: "informative",
    contentType: "hashtags",
  };
  const hashtagsResult = await generateAiContent(hashtagsSettings);
  assert.ok(hashtagsResult.hashtags.length >= 3, "Should have at least 3 hashtags");
  assert.ok(hashtagsResult.hashtags.every((tag) => tag.startsWith("#")), "All tags must start with #");
  assert.ok(!containsEmoji(hashtagsResult.content), "Hashtags must not contain emojis");
  console.log("PASS: Test 3 - Hashtag generation");

  // Test 4: Campaign ideas generation
  const campaignSettings: PromptSettings = {
    topic: "Cloud Accounting Platform Launch",
    platform: "linkedin",
    tone: "professional",
    contentType: "campaign_ideas",
    targetAudience: "Small business owners",
  };
  const campaignResult = await generateAiContent(campaignSettings);
  assert.ok(campaignResult.content.includes("Campaign Concept:"), "Should contain campaign concept");
  assert.ok(campaignResult.content.includes("Target Channel Strategy"), "Should contain channel strategy");
  assert.ok(!containsEmoji(campaignResult.content), "Campaign ideas must not contain emojis");
  console.log("PASS: Test 4 - Campaign ideas generation");

  // Test 5: Deterministic consistency in mock mode
  const firstRun = await generateAiContent(captionSettings);
  const secondRun = await generateAiContent(captionSettings);
  if (firstRun.provider === "mock") {
    assert.equal(firstRun.content, secondRun.content, "Mock outputs for identical settings must be deterministic");
  }
  console.log("PASS: Test 5 - Deterministic consistency");


  console.log("\nAll 5 C1 tests completed successfully.");
}

runTests().catch((err) => {
  console.error("Test failure:", err);
  process.exit(1);
});
