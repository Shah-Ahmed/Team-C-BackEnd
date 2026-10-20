// AI content generation engine for Team C.
// Generates captions, product descriptions, hashtags, and campaign ideas.
// Connects to live Google Gemini models with automatic multi-model failover,
// and gracefully falls back to a deterministic rule-based generator when offline.

import type {
  ContentType,
  GenerateResult,
  Platform,
  PromptSettings,
  Tone,
} from "@/types";

// Generates a stable integer hash from a string to ensure deterministic mock outputs.
function simpleHash(str: string): number {

  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function extractHashtagsFromText(text: string): string[] {
  const matches = text.match(/#\w+/g);
  if (!matches) return [];
  const set = new Set(matches.map((tag) => tag.trim()));
  return Array.from(set);
}

function cleanTopicKeywords(topic: string): string[] {
  return topic
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter((word) => word.length > 2 && !["the", "and", "for", "with", "this", "that"].includes(word));
}

function buildMockHashtags(topic: string, platform: Platform): string[] {
  const keywords = cleanTopicKeywords(topic);
  const baseTags = keywords.map((word) => `#${word.charAt(0).toUpperCase() + word.slice(1)}`);

  const platformTags: Record<Platform, string[]> = {
    instagram: ["#InstaDaily", "#TrendingNow", "#BrandStory", "#DiscoverMore"],
    twitter: ["#TechNews", "#Updates", "#Discussion", "#Growth"],
    linkedin: ["#ProfessionalGrowth", "#Innovation", "#Leadership", "#BusinessStrategy"],
    facebook: ["#Community", "#Updates", "#SpecialOffer", "#StayTuned"],
    general: ["#Marketing", "#Innovation", "#Growth", "#ContentStrategy"],
  };

  const selectedPlatformTags = platformTags[platform] || platformTags.general;
  const combined = Array.from(new Set([...baseTags, ...selectedPlatformTags]));
  return combined.slice(0, 6);
}

function generateMockContent(settings: PromptSettings): { content: string; hashtags: string[] } {
  const { topic, platform, tone, contentType, targetAudience } = settings;
  const hash = simpleHash(`${topic}-${platform}-${tone}-${contentType}`);
  const audienceClause = targetAudience ? ` Specifically designed for ${targetAudience}.` : "";

  let content = "";

  if (contentType === "caption") {
    const toneStarters: Record<Tone, string[]> = {
      professional: [
        `Introducing ${topic}. An essential advancement built with precision and reliability.${audienceClause} Learn how this delivers measurable value for your workflow.`,
        `Quality and efficiency define ${topic}. Engineered to address your core operational requirements.${audienceClause} Discover the difference in execution today.`,
      ],
      casual: [
        `Looking for something fresh? Check out ${topic}.${audienceClause} Simple, dependable, and ready whenever you are. Let us know your thoughts below.`,
        `Here is a quick look at ${topic}. We made this straightforward so you can focus on what matters.${audienceClause} Give it a try and see for yourself.`,
      ],
      excited: [
        `The wait is over! We are thrilled to announce ${topic}.${audienceClause} Get ready to experience a whole new level of performance and craft. Check it out now!`,
        `Big news is finally here! Introducing ${topic}, built from the ground up for maximum impact.${audienceClause} Take a closer look today!`,
      ],
      witty: [
        `Whoever said ${topic} could not be made simpler clearly had not seen this yet.${audienceClause} Work smarter, not harder. You can thank us later.`,
        `Skip the complexity and get straight to what works: ${topic}.${audienceClause} Practical, sharp, and surprisingly seamless.`,
      ],
      urgent: [
        `Time is limited. Secure your access to ${topic} before this introductory window closes.${audienceClause} Take immediate action today to get started.`,
        `Do not miss out on ${topic}. Demand is high and availability is prioritized for early inquiries.${audienceClause} Review details and act now.`,
      ],
      informative: [
        `Understanding ${topic}: what it delivers and why it matters.${audienceClause} Built upon proven principles to streamline day-to-day operations and improve overall consistency.`,
        `A closer examination of ${topic}. Here is how key specifications translate to practical advantages in everyday use.${audienceClause}`,
      ],
    };

    const starterPool = toneStarters[tone] || toneStarters.professional;
    content = starterPool[hash % starterPool.length];
  } else if (contentType === "product_description") {
    content = [
      `Overview: ${topic}.`,
      `Key Benefits: Built to provide reliable performance, intuitive usability, and verified consistency.${audienceClause}`,
      `Specifications: Engineered according to modern industry standards with comprehensive quality assurance.`,
      `Ideal Use Case: Recommended for teams and individuals seeking dependable, long-term results without unnecessary complexity.`,
    ].join("\n\n");
  } else if (contentType === "hashtags") {
    const tags = buildMockHashtags(topic, platform);
    content = tags.join(" ");
    return { content, hashtags: tags };
  } else if (contentType === "campaign_ideas") {
    content = [
      `Campaign Concept: The ${topic} Initiative`,
      `Core Message: Consistent quality meets dependable execution.${audienceClause}`,
      `Target Channel Strategy (${platform}): Launch with an introductory announcement, followed by practical use cases and user spotlight stories.`,
      `Call to Action: Direct prospects to register interest and access introductory documentation.`,
    ].join("\n\n");
  }

  const hashtags = buildMockHashtags(topic, platform);
  return { content, hashtags };
}

const GEMINI_MODELS = [
  "gemini-3.6-flash",
  "gemini-3.5-flash-lite",
  "gemini-flash-latest",
  "gemini-3.8-flash",
];

async function callGeminiApi(settings: PromptSettings, apiKey: string): Promise<{ content: string; hashtags: string[] }> {
  const { topic, platform, tone, contentType, language, targetAudience } = settings;

  const promptText = `
You are a senior social media copywriter.
Generate content according to these exact parameters:
- Topic: ${topic}
- Platform: ${platform}
- Tone: ${tone}
- Content Type: ${contentType}
- Language: ${language || "en"}
${targetAudience ? `- Target Audience: ${targetAudience}` : ""}

STRICT CONSTRAINTS:
1. Do not use any emojis in the generated text.
2. Return your output as valid JSON with two fields:
   "content": A string containing the generated post or description.
   "hashtags": An array of strings containing relevant hashtags (each starting with #).
Do not wrap your output in markdown code blocks. Return only raw JSON.
`;

  let lastError: Error | null = null;

  for (const model of GEMINI_MODELS) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: promptText }] }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 1500,
            responseMimeType: "application/json",
          },
        }),
        signal: AbortSignal.timeout(8000),
      });

      if (!response.ok) {
        const errorText = await response.text();
        lastError = new Error(`Gemini ${model} error (${response.status}): ${errorText.slice(0, 150)}`);
        continue;
      }

      const data = (await response.json()) as {
        candidates?: Array<{
          content?: {
            parts?: Array<{ text?: string }>;
          };
        }>;
      };

      const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
      if (!rawText) continue;

      const sanitizedJson = rawText.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();

      try {
        const parsed = JSON.parse(sanitizedJson) as { content?: string; hashtags?: string[] };
        const content = typeof parsed.content === "string" ? parsed.content.trim() : rawText;
        const hashtags = Array.isArray(parsed.hashtags)
          ? parsed.hashtags.filter((tag) => typeof tag === "string" && tag.startsWith("#"))
          : extractHashtagsFromText(content);

        return { content, hashtags };
      } catch {
        return {
          content: rawText,
          hashtags: extractHashtagsFromText(rawText),
        };
      }
    } catch (err) {
      lastError = err as Error;
    }
  }

  throw lastError || new Error("All Gemini candidate models failed to respond");
}


/**
 * Generates marketing content and hashtags based on prompt settings.
 * Uses Google Gemini when GEMINI_API_KEY is configured in the environment;
 * otherwise seamlessly falls back to a deterministic rule-based generator.
 */
export async function generateAiContent(settings: PromptSettings): Promise<GenerateResult> {
  const geminiKey = process.env.GEMINI_API_KEY?.trim();


  if (geminiKey) {
    try {
      const { content, hashtags } = await callGeminiApi(settings, geminiKey);
      return {
        content,
        hashtags,
        promptSettings: settings,
        provider: "gemini",
        generatedAt: Date.now(),
      };
    } catch (error) {
      console.warn("AI provider error, falling back to deterministic mock generator:", (error as Error).message);
    }
  }

  const { content, hashtags } = generateMockContent(settings);
  return {
    content,
    hashtags,
    promptSettings: settings,
    provider: "mock",
    generatedAt: Date.now(),
  };
}
