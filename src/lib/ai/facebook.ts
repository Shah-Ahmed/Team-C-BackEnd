// Facebook Page Graph API helper for publishing posts and fetching comments

import { HttpError } from "@/lib/errors";

export interface FacebookComment {
  externalId: string;
  mediaId: string;
  text: string;
  author: string;
  timestamp: string;
}

const GRAPH_BASE_URL = "https://graph.facebook.com/v21.0";

// Check whether a Facebook Page or User access token is configured
export function isFacebookConfigured(): boolean {
  return Boolean(
    process.env.FACEBOOK_PAGE_ACCESS_TOKEN?.trim() ||
    process.env.FACEBOOK_ACCESS_TOKEN?.trim()
  );
}

// Resolve a Page ID and Page Access Token from environment config or /me/accounts
async function resolveFacebookPageCredentials(): Promise<{
  pageId: string;
  pageToken: string;
}> {
  const rawToken =
    process.env.FACEBOOK_PAGE_ACCESS_TOKEN?.trim() ||
    process.env.FACEBOOK_ACCESS_TOKEN?.trim() ||
    "";
  const configuredPageId = process.env.FACEBOOK_PAGE_ID?.trim() || "";

  if (!rawToken) {
    throw new HttpError(400, "FACEBOOK_PAGE_ACCESS_TOKEN is not configured in .env.local");
  }

  // Return immediately when token is already a dedicated Page token matching configuredPageId
  const meRes = await fetch(
    `${GRAPH_BASE_URL}/me?fields=id,name&access_token=${encodeURIComponent(rawToken)}`
  );
  const meData = (await meRes.json()) as { id?: string };

  if (configuredPageId && meRes.ok && meData.id && String(meData.id) === configuredPageId) {
    return {
      pageId: configuredPageId,
      pageToken: rawToken,
    };
  }

  // Try exchanging a User token for a Page token via /me/accounts
  const accountsRes = await fetch(
    `${GRAPH_BASE_URL}/me/accounts?fields=id,name,access_token&access_token=${encodeURIComponent(rawToken)}`
  );
  const accountsData = (await accountsRes.json()) as {
    data?: Array<{ id?: string; name?: string; access_token?: string }>;
  };

  if (accountsRes.ok && Array.isArray(accountsData.data) && accountsData.data.length > 0) {
    const matched = configuredPageId
      ? accountsData.data.find((p) => String(p.id) === configuredPageId) || accountsData.data[0]
      : accountsData.data[0];

    if (matched?.id) {
      return {
        pageId: String(matched.id),
        pageToken: String(matched.access_token || rawToken),
      };
    }
  }

  if (configuredPageId) {
    return {
      pageId: configuredPageId,
      pageToken: rawToken,
    };
  }

  if (meRes.ok && meData.id) {
    return {
      pageId: String(meData.id),
      pageToken: rawToken,
    };
  }

  throw new HttpError(
    400,
    "Could not resolve Facebook Page ID. Make sure you created a Facebook Page and granted pages_manage_posts and pages_read_engagement permissions."
  );
}

// Publish a text post or photo post to the configured Facebook Page
export async function publishToFacebookPage(input: {
  message: string;
  imageUrl?: string;
}): Promise<{ externalId: string; message: string }> {
  const { pageId, pageToken } = await resolveFacebookPageCredentials();

  if (input.imageUrl && input.imageUrl.trim()) {
    const params = new URLSearchParams({
      url: input.imageUrl.trim(),
      message: input.message,
      access_token: pageToken,
    });

    const res = await fetch(`${GRAPH_BASE_URL}/${pageId}/photos`, {
      method: "POST",
      body: params,
    });

    const data = (await res.json()) as {
      id?: string;
      post_id?: string;
      error?: { message?: string };
    };

    if (!res.ok || (!data.post_id && !data.id)) {
      throw new HttpError(
        502,
        data?.error?.message || "Failed to publish photo post to Facebook Page"
      );
    }

    return {
      externalId: String(data.post_id || data.id),
      message: "Photo post published to live Facebook Page",
    };
  }

  const params = new URLSearchParams({
    message: input.message,
    access_token: pageToken,
  });

  const res = await fetch(`${GRAPH_BASE_URL}/${pageId}/feed`, {
    method: "POST",
    body: params,
  });

  const data = (await res.json()) as {
    id?: string;
    error?: { message?: string };
  };

  if (!res.ok || !data.id) {
    throw new HttpError(
      502,
      data?.error?.message || "Failed to publish post to Facebook Page"
    );
  }

  return {
    externalId: String(data.id),
    message: "Post published to live Facebook Page",
  };
}

// Fetch comments from recent posts on the configured Facebook Page
export async function fetchRecentFacebookComments(): Promise<FacebookComment[]> {
  const { pageId, pageToken } = await resolveFacebookPageCredentials();
  const url = `${GRAPH_BASE_URL}/${pageId}/feed?fields=id,message,comments{id,message,from,created_time}&limit=15&access_token=${encodeURIComponent(pageToken)}`;

  const res = await fetch(url);
  const data = (await res.json()) as {
    data?: Array<{
      id?: string;
      comments?: {
        data?: Array<{
          id?: string;
          message?: string;
          from?: { name?: string };
          created_time?: string;
        }>;
      };
    }>;
    error?: { message?: string };
  };

  if (!res.ok) {
    throw new HttpError(
      502,
      data?.error?.message || "Failed to fetch comments from Facebook Page"
    );
  }

  const results: FacebookComment[] = [];
  const posts = Array.isArray(data.data) ? data.data : [];

  for (const post of posts) {
    if (!post.id) continue;
    const comments = Array.isArray(post.comments?.data) ? post.comments.data : [];

    for (const comment of comments) {
      const text = typeof comment.message === "string" ? comment.message.trim() : "";
      if (!comment.id || !text) continue;

      results.push({
        externalId: String(comment.id),
        mediaId: String(post.id),
        text,
        author: String(comment.from?.name || "Facebook User"),
        timestamp: String(comment.created_time || ""),
      });
    }
  }

  return results;
}
