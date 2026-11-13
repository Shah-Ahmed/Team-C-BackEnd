// Instagram Graph API helper for publishing media and fetching comments

import { HttpError } from "@/lib/errors";

export interface InstagramComment {
  externalId: string;
  mediaId: string;
  text: string;
  author: string;
  timestamp: string;
}

interface InstagramConfig {
  token: string;
  accountId: string;
  baseUrl: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Check whether an Instagram access token is configured
export function isInstagramConfigured(): boolean {
  return Boolean(process.env.INSTAGRAM_ACCESS_TOKEN?.trim());
}

// Resolve token and API base URL for Instagram or Facebook Graph endpoints
function getInstagramConfig(): InstagramConfig {
  const token = process.env.INSTAGRAM_ACCESS_TOKEN?.trim() || "";
  const accountId = process.env.INSTAGRAM_ACCOUNT_ID?.trim() || "";
  const baseUrl = token.startsWith("IG")
    ? "https://graph.instagram.com/v21.0"
    : "https://graph.facebook.com/v21.0";

  return { token, accountId, baseUrl };
}

// Lookup the Instagram account ID automatically if omitted from environment variables
async function resolveInstagramAccountId(
  token: string,
  baseUrl: string,
  configuredId: string
): Promise<string> {
  if (configuredId) return configuredId;

  if (token.startsWith("IG")) {
    const res = await fetch(
      `${baseUrl}/me?fields=user_id,id,username&access_token=${encodeURIComponent(token)}`
    );
    const data = (await res.json()) as { user_id?: string; id?: string };
    const resolved = data.user_id || data.id;
    if (res.ok && resolved) return String(resolved);
  } else {
    const res = await fetch(
      `${baseUrl}/me/accounts?fields=instagram_business_account{id,username}&access_token=${encodeURIComponent(token)}`
    );
    const data = (await res.json()) as {
      data?: Array<{ instagram_business_account?: { id?: string } }>;
    };
    const resolved = data.data?.[0]?.instagram_business_account?.id;
    if (res.ok && resolved) return String(resolved);
  }

  throw new HttpError(400, "Could not resolve Instagram Account ID. Set INSTAGRAM_ACCOUNT_ID in .env.local");
}

// Publish an image post to Instagram using the two-step container workflow
export async function publishToInstagram(input: {
  caption: string;
  imageUrl: string;
}): Promise<{ externalId: string; message: string }> {
  const { token, accountId: configuredId, baseUrl } = getInstagramConfig();
  if (!token) {
    throw new HttpError(400, "INSTAGRAM_ACCESS_TOKEN is not configured in .env.local");
  }

  const accountId = await resolveInstagramAccountId(token, baseUrl, configuredId);

  // Step 1: create media container with image URL and caption
  const containerParams = new URLSearchParams({
    image_url: input.imageUrl,
    caption: input.caption,
    access_token: token,
  });

  const containerRes = await fetch(`${baseUrl}/${accountId}/media`, {
    method: "POST",
    body: containerParams,
  });

  const containerData = (await containerRes.json()) as {
    id?: string;
    error?: { message?: string };
  };

  if (!containerRes.ok || !containerData.id) {
    throw new HttpError(
      502,
      containerData?.error?.message || "Failed to create Instagram media container"
    );
  }

  // Wait briefly for container processing before publishing
  await sleep(2000);

  // Step 2: publish the created container with retry for transient readiness errors
  const maxAttempts = 4;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const publishParams = new URLSearchParams({
      creation_id: containerData.id,
      access_token: token,
    });

    const publishRes = await fetch(`${baseUrl}/${accountId}/media_publish`, {
      method: "POST",
      body: publishParams,
    });

    const publishData = (await publishRes.json()) as {
      id?: string;
      error?: { message?: string; code?: number; error_subcode?: number };
    };

    if (publishRes.ok && publishData.id) {
      return {
        externalId: String(publishData.id),
        message: "Post published to live Instagram account",
      };
    }

    const code = publishData?.error?.code;
    const subcode = publishData?.error?.error_subcode;
    const isMediaNotReady = code === 9007 || subcode === 2207027;

    if (isMediaNotReady && attempt < maxAttempts) {
      await sleep(2500);
      continue;
    }

    throw new HttpError(
      502,
      publishData?.error?.message || "Failed to publish Instagram media container"
    );
  }

  throw new HttpError(502, "Timed out waiting for Instagram media container to publish");
}

// Fetch comments from recent media posts on the configured Instagram account
export async function fetchRecentInstagramComments(): Promise<InstagramComment[]> {
  const { token, accountId: configuredId, baseUrl } = getInstagramConfig();
  if (!token) {
    throw new HttpError(400, "INSTAGRAM_ACCESS_TOKEN is not configured in .env.local");
  }

  const accountId = await resolveInstagramAccountId(token, baseUrl, configuredId);
  const url = `${baseUrl}/${accountId}/media?fields=id,caption,comments{id,text,username,from,timestamp}&limit=15&access_token=${encodeURIComponent(token)}`;

  const res = await fetch(url);
  const data = (await res.json()) as {
    data?: Array<{
      id?: string;
      comments?: {
        data?: Array<{
          id?: string;
          text?: string;
          username?: string;
          from?: { username?: string };
          timestamp?: string;
        }>;
      };
    }>;
    error?: { message?: string };
  };

  if (!res.ok) {
    throw new HttpError(
      502,
      data?.error?.message || "Failed to fetch comments from Instagram Graph API"
    );
  }

  const results: InstagramComment[] = [];
  const mediaItems = Array.isArray(data.data) ? data.data : [];

  for (const media of mediaItems) {
    if (!media.id) continue;
    const comments = Array.isArray(media.comments?.data) ? media.comments.data : [];

    for (const comment of comments) {
      const text = typeof comment.text === "string" ? comment.text.trim() : "";
      if (!comment.id || !text) continue;

      const author = comment.username || comment.from?.username || "instagram_user";
      results.push({
        externalId: String(comment.id),
        mediaId: String(media.id),
        text,
        author: String(author),
        timestamp: String(comment.timestamp || ""),
      });
    }
  }

  return results;
}
