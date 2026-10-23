import assert from "node:assert/strict";
import {
  analyzeSentiment,
  getSentimentSummary,
  listSentimentResults,
  saveSentimentResult,
} from "../src/lib/ai/sentiment";
import { getAdminDb } from "../src/lib/firebaseAdmin";

function containsEmoji(text: string): boolean {
  const emojiRegex = /[\p{Emoji_Presentation}\p{Extended_Pictographic}]/u;
  return emojiRegex.test(text);
}

async function runTests() {
  console.log("Running C4 sentiment analysis automated tests...");

  const testOrgA = "test_org_team_c_sentiment_alpha";
  const testOrgB = "test_org_team_c_sentiment_beta";
  const testUserA = "test_user_alpha_01";

  // Test 1: Positive sentiment classification
  const positiveInput = "Absolutely love this new content automation tool! Saved me hours of tedious work.";
  const positiveResult = await analyzeSentiment(positiveInput);
  assert.equal(positiveResult.sentiment, "positive", "Should classify as positive");
  assert.ok(positiveResult.score >= 0.60, "Confidence score should be >= 0.60");
  assert.ok(Array.isArray(positiveResult.keyThemes), "keyThemes must be an array");
  assert.ok(["gemini", "mock"].includes(positiveResult.provider), "Provider must be gemini or mock");
  assert.ok(!containsEmoji(positiveInput), "Input text contains no emoji");
  console.log("PASS: Test 1 - Positive sentiment classification");

  // Test 2: Negative sentiment classification
  const negativeInput = "Scheduled post failed to publish this morning. Terrible bug and awful user experience.";
  const negativeResult = await analyzeSentiment(negativeInput);
  assert.equal(negativeResult.sentiment, "negative", "Should classify as negative");
  assert.ok(negativeResult.score >= 0.60, "Confidence score should be >= 0.60");
  assert.ok(Array.isArray(negativeResult.keyThemes), "keyThemes must be an array");
  console.log("PASS: Test 2 - Negative sentiment classification");

  // Test 3: Neutral sentiment classification
  const neutralInput = "The documentation lists the system architecture specifications and port configurations.";
  const neutralResult = await analyzeSentiment(neutralInput);
  assert.equal(neutralResult.sentiment, "neutral", "Should classify as neutral");
  assert.ok(neutralResult.score >= 0.40, "Confidence score should be >= 0.40");
  console.log("PASS: Test 3 - Neutral sentiment classification");

  // Test 4: Persistence and organization isolation
  const savedRecordA = await saveSentimentResult(testOrgA, testUserA, {
    text: positiveInput,
    author: "Sarah K.",
  });

  assert.ok(savedRecordA.id, "Record ID must be assigned");
  assert.equal(savedRecordA.orgId, testOrgA);
  assert.equal(savedRecordA.author, "Sarah K.");
  assert.equal(savedRecordA.sentiment, "positive");
  assert.ok(!containsEmoji(savedRecordA.text), "Saved text must not contain emojis");

  const listOrgA = await listSentimentResults(testOrgA);
  assert.ok(listOrgA.some((r) => r.id === savedRecordA.id), "Org A list must contain saved record");

  const listOrgB = await listSentimentResults(testOrgB);
  assert.ok(!listOrgB.some((r) => r.id === savedRecordA.id), "Org B list must never contain Org A record");
  console.log("PASS: Test 4 - Persistence and organization isolation");

  // Test 5: Summary analytics aggregation
  const savedRecordB = await saveSentimentResult(testOrgA, testUserA, {
    text: negativeInput,
    author: "Alex P.",
  });
  const savedRecordC = await saveSentimentResult(testOrgA, testUserA, {
    text: neutralInput,
    author: "David M.",
  });

  const summary = await getSentimentSummary(testOrgA);
  assert.ok(summary.total >= 3, "Total records in summary must be at least 3");
  assert.ok(summary.positive.count >= 1, "Positive count must be >= 1");
  assert.ok(summary.negative.count >= 1, "Negative count must be >= 1");
  assert.ok(summary.neutral.count >= 1, "Neutral count must be >= 1");
  const percentSum = summary.positive.percentage + summary.negative.percentage + summary.neutral.percentage;
  assert.ok(percentSum >= 98 && percentSum <= 102, "Percentages should sum to approximately 100%");
  console.log("PASS: Test 5 - Summary analytics aggregation");

  // Test 6: Input boundary and validation handling
  let emptyInputThrew = false;
  try {
    await saveSentimentResult(testOrgA, testUserA, { text: "   " });
  } catch (err: unknown) {
    emptyInputThrew = true;
    assert.equal((err as { status: number }).status, 400, "Empty text must throw 400");
  }
  assert.ok(emptyInputThrew, "Empty input must be rejected with 400");

  let oversizedInputThrew = false;
  try {
    const hugeText = "a".repeat(5001);
    await saveSentimentResult(testOrgA, testUserA, { text: hugeText });
  } catch (err: unknown) {
    oversizedInputThrew = true;
    assert.equal((err as { status: number }).status, 400, "Oversized text must throw 400");
  }
  assert.ok(oversizedInputThrew, "Oversized input (>5000 characters) must be rejected with 400");
  console.log("PASS: Test 6 - Input boundary and validation handling");

  // Test 7: Cleanup test records
  const db = getAdminDb();
  await db.collection("aiSentimentResults").doc(savedRecordA.id!).delete();
  await db.collection("aiSentimentResults").doc(savedRecordB.id!).delete();
  await db.collection("aiSentimentResults").doc(savedRecordC.id!).delete();
  console.log("PASS: Test 7 - Cleanup test records");

  console.log("\nAll 7 C4 tests completed successfully.");
}

runTests().catch((err) => {
  console.error("Test failure:", err);
  process.exit(1);
});
