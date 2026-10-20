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

