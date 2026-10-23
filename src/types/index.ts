// Types shared across the backend.

export type Role = "super_admin" | "admin" | "user";

// Stored in Firestore: users/{uid}   (the document id is the Firebase Auth uid)
export interface UserDoc {
  name: string;
  email: string;
  role: Role;
  orgId: string | null; // null for super_admin
  createdAt: number; // unix ms
  isActive: boolean; // false = "deleted" (soft delete, the record stays in the database)
  deletedAt?: number; // unix ms, set when isActive becomes false
}

// Stored in Firestore: organizations/{orgId}
export interface OrganizationDoc {
  name: string;
  adminUid: string;
  adminName: string;
  adminEmail: string;
  createdAt: number; // unix ms
  isActive: boolean; // false = "deleted" (soft delete, the record stays in the database)
  deletedAt?: number; // unix ms, set when isActive becomes false
}

// What the verified JWT gives us on every request.
export interface AuthUser {
  uid: string;
  email: string | null;
  role: Role | null;
  orgId: string | null;
}

export type ContentType = "caption" | "product_description" | "hashtags" | "campaign_ideas";
export type Platform = "instagram" | "twitter" | "linkedin" | "facebook" | "general";
export type Tone = "professional" | "casual" | "excited" | "witty" | "urgent" | "informative";
export type DraftStatus = "draft" | "reviewed" | "scheduled" | "archived";

export interface MediaReference {
  url: string;
  type: "image" | "video";
  altText?: string;
}

export interface PromptSettings {
  topic: string;
  platform: Platform;
  tone: Tone;
  contentType: ContentType;
  language?: string;
  targetAudience?: string;
}

export interface GenerateResult {
  content: string;
  hashtags: string[];
  promptSettings: PromptSettings;
  provider: "gemini" | "mock";
  generatedAt: number;
}

export interface AiContentDraftDoc {
  id?: string;
  orgId: string;
  createdBy: string;
  title: string;
  promptSettings: PromptSettings;
  generatedContent: string;
  hashtags: string[];
  status: DraftStatus;
  media: MediaReference[];
  providerUsed: "gemini" | "mock";
  version: number;
  createdAt: number;
  updatedAt: number;
}

// ---------- Task C3: Scheduling and Publishing Types ----------

export type ScheduledPostStatus = "draft" | "scheduled" | "published" | "failed";

export interface ScheduledPostDoc {
  id?: string;
  orgId: string;
  createdBy: string;
  draftId?: string; // Optional reference linking to an aiContentDrafts record
  topic: string;
  platform: Platform;
  content: string;
  hashtags: string[];
  media: MediaReference[];
  scheduledTime: number; // Canonical unix timestamp in milliseconds
  scheduledIso?: string; // ISO 8601 string representation
  timezone: string; // IANA timezone string e.g. "UTC"
  status: ScheduledPostStatus;
  isSimulated: boolean; // Explicitly true when published via simulation
  publishedAt?: number; // Unix timestamp in ms when published
  failureReason?: string; // Descriptive failure message if status is "failed"
  createdAt: number;
  updatedAt: number;
}

export interface CreateScheduledPostInput {
  draftId?: string;
  topic?: string;
  platform?: Platform;
  content?: string;
  hashtags?: string[];
  media?: MediaReference[];
  scheduledTime: number; // Unix ms
  timezone?: string;
  status?: ScheduledPostStatus;
}

export interface UpdateScheduledPostInput {
  topic?: string;
  platform?: Platform;
  content?: string;
  hashtags?: string[];
  media?: MediaReference[];
  scheduledTime?: number;
  timezone?: string;
  status?: ScheduledPostStatus;
}

export interface PublishPostResult {
  post: ScheduledPostDoc;
  isSimulated: boolean;
  publishedAt: number;
  platformResponse: {
    success: boolean;
    simulated: boolean;
    message: string;
    externalId?: string;
  };
}

// ---------- Task C4: Sentiment Analysis Types ----------

export type SentimentType = "positive" | "neutral" | "negative";

export interface SentimentResultDoc {
  id?: string;
  orgId: string;
  createdBy: string;
  text: string;
  author?: string; // Optional reviewer or commenter name
  sentiment: SentimentType;
  score: number; // Confidence score between 0.00 and 1.00
  keyThemes: string[]; // Extracted themes or aspects
  provider: "gemini" | "mock";
  createdAt: number;
}

export interface AnalyzeSentimentInput {
  text: string;
  author?: string;
}

export interface SentimentMetric {
  count: number;
  percentage: number;
}

export interface SentimentSummary {
  total: number;
  positive: SentimentMetric;
  neutral: SentimentMetric;
  negative: SentimentMetric;
}


