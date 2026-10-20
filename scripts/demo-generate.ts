import { generateAiContent } from "../src/lib/ai/generator";
import type { ContentType, Platform, PromptSettings, Tone } from "../src/types";

async function main() {
  const args = process.argv.slice(2);
  const topic = args[0] || "Next Generation Wireless Earbuds";
  const contentType: ContentType = (args[1] as ContentType) || "caption";
  const platform: Platform = (args[2] as Platform) || "instagram";
  const tone: Tone = (args[3] as Tone) || "excited";

  console.log("==========================================");
  console.log("Team C: AI Content Generation Demo");
  console.log("==========================================");
  console.log(`Topic:        ${topic}`);
  console.log(`Content Type: ${contentType}`);
  console.log(`Platform:     ${platform}`);
  console.log(`Tone:         ${tone}`);
  console.log("------------------------------------------");
  console.log("Generating content...\n");

  const settings: PromptSettings = {
    topic,
    contentType,
    platform,
    tone,
    language: "en",
  };

  const result = await generateAiContent(settings);

  console.log(`Provider Used: ${result.provider}`);
  console.log(`Generated At:  ${new Date(result.generatedAt).toISOString()}`);
  console.log("\nGenerated Content:");
  console.log(result.content);
  console.log("\nHashtags:");
  console.log(result.hashtags.join(" "));
  console.log("==========================================");
}

main().catch((err) => {
  console.error("Execution error:", err);
  process.exit(1);
});
