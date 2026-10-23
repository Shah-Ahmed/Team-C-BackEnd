# Team C: AI Content & Social Automation API Contract

This document provides the complete API specification for Team C backend endpoints.
Base URL: `http://localhost:3001`
Assigned API Prefix: `/api/ai/*`
Assigned Firestore Collections: `aiContentDrafts`, `aiScheduledPosts`, `aiSentimentResults`

---

## Authentication & Authorization

All `/api/ai/*` endpoints require authentication.
Include the Firebase ID Token (JWT) in every request header:

```http
Authorization: Bearer <ID_TOKEN>
Content-Type: application/json
```

- Allowed Roles: `admin`, `user`
- Multi-tenancy: The backend automatically extracts `orgId` from the verified token. All drafts and operations are strictly isolated to the caller's organization. Clients must not supply or override `orgId`.

---

## Endpoints Summary

| Method | Endpoint | Task | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/ai/generate` | C1 | Generate AI post captions, descriptions, hashtags, or campaign ideas. |
| `GET` | `/api/ai/drafts` | C2 | List all drafts belonging to the authenticated organization. |
| `POST` | `/api/ai/drafts` | C2 | Save a new draft to the library. |
| `GET` | `/api/ai/drafts/:id` | C2 | Retrieve a single draft by ID. |
| `PUT` | `/api/ai/drafts/:id` | C2 | Update an existing draft. |
| `DELETE` | `/api/ai/drafts/:id` | C2 | Delete a draft. |
| `POST` | `/api/ai/drafts/:id/regenerate` | C2 | Regenerate content for an existing draft and increment its version. |
| `GET` | `/api/ai/schedule` | C3 | List scheduled posts for the authenticated organization. |
| `POST` | `/api/ai/schedule` | C3 | Create a scheduled post (standalone or linked to a draft). |
| `GET` | `/api/ai/schedule/:id` | C3 | Retrieve a single scheduled post. |
| `PUT` | `/api/ai/schedule/:id` | C3 | Update scheduled post time, timezone, content, or status. |
| `DELETE` | `/api/ai/schedule/:id` | C3 | Cancel and delete a scheduled post. |
| `POST` | `/api/ai/schedule/:id/publish` | C3 | Trigger simulated or real publishing workflow. |
| `GET` | `/api/ai/sentiment` | C4 | List sentiment analysis records for the authenticated organization. |
| `POST` | `/api/ai/sentiment` | C4 | Analyze review or comment text sentiment and save result. |
| `GET` | `/api/ai/sentiment/summary` | C4 | Retrieve aggregate sentiment analytics (% positive, neutral, negative). |

---

## 1. Generate AI Content

### `POST /api/ai/generate`

Generates social media content using either Google Gemini (if configured) or the deterministic mock generator.

#### Request Body
```json
{
  "topic": "Noise Cancelling Headphones",
  "contentType": "caption",
  "platform": "instagram",
  "tone": "excited",
  "language": "en",
  "targetAudience": "Commuters and remote workers"
}
```

#### Field Specifications
- `topic` (string, required): 2 to 500 characters.
- `contentType` (string, required): One of `"caption"`, `"product_description"`, `"hashtags"`, `"campaign_ideas"`.
- `platform` (string, optional): One of `"instagram"`, `"twitter"`, `"linkedin"`, `"facebook"`, `"general"`. Defaults to `"general"`.
- `tone` (string, optional): One of `"professional"`, `"casual"`, `"excited"`, `"witty"`, `"urgent"`, `"informative"`. Defaults to `"professional"`.
- `language` (string, optional): Language code. Defaults to `"en"`.
- `targetAudience` (string, optional): Up to 200 characters describing the target demographic.

#### Success Response (200 OK)
```json
{
  "content": "The wait is over! We are thrilled to announce Noise Cancelling Headphones. Specifically designed for Commuters and remote workers. Get ready to experience a whole new level of performance and craft. Check it out now!",
  "hashtags": [
    "#Noise",
    "#Cancelling",
    "#Headphones",
    "#InstaDaily",
    "#TrendingNow",
    "#BrandStory"
  ],
  "promptSettings": {
    "topic": "Noise Cancelling Headphones",
    "contentType": "caption",
    "platform": "instagram",
    "tone": "excited",
    "language": "en",
    "targetAudience": "Commuters and remote workers"
  },
  "provider": "mock",
  "generatedAt": 1729438821000
}
```

---

## 2. List Drafts

### `GET /api/ai/drafts`

Retrieves all drafts belonging to the caller's organization, ordered by `updatedAt` descending.

#### Query Parameters
- `status` (string, optional): Filter by status (`"draft"`, `"reviewed"`, `"scheduled"`, `"archived"`).

#### Success Response (200 OK)
```json
[
  {
    "id": "draft_01HXYZ",
    "orgId": "org_123",
    "createdBy": "user_456",
    "title": "Headphones Launch Post",
    "promptSettings": {
      "topic": "Noise Cancelling Headphones",
      "contentType": "caption",
      "platform": "instagram",
      "tone": "excited",
      "language": "en",
      "targetAudience": "Commuters"
    },
    "generatedContent": "The wait is over! Introducing Noise Cancelling Headphones...",
    "hashtags": ["#Noise", "#Headphones", "#TrendingNow"],
    "status": "draft",
    "media": [
      {
        "url": "https://images.example.com/headphones.jpg",
        "type": "image",
        "altText": "Front view of headphones"
      }
    ],
    "providerUsed": "mock",
    "version": 1,
    "createdAt": 1729438821000,
    "updatedAt": 1729438821000
  }
]
```

---

## 3. Create Draft

### `POST /api/ai/drafts`

Saves a newly generated or custom post as a draft in `aiContentDrafts`.

#### Request Body
```json
{
  "title": "Headphones Launch Post",
  "promptSettings": {
    "topic": "Noise Cancelling Headphones",
    "contentType": "caption",
    "platform": "instagram",
    "tone": "excited",
    "language": "en",
    "targetAudience": "Commuters"
  },
  "generatedContent": "The wait is over! Introducing Noise Cancelling Headphones...",
  "hashtags": ["#Noise", "#Headphones"],
  "status": "draft",
  "media": [
    {
      "url": "https://images.example.com/headphones.jpg",
      "type": "image",
      "altText": "Product image"
    }
  ],
  "providerUsed": "mock"
}
```

#### Success Response (201 Created)
Returns the created draft document with its assigned Firestore `id`, `orgId`, `createdBy`, `version: 1`, `createdAt`, and `updatedAt`.

---

## 4. Get Single Draft

### `GET /api/ai/drafts/:id`

Retrieves a single draft. Returns `404` if the draft does not exist or belongs to another organization.

#### Success Response (200 OK)
Returns the single draft object.

---

## 5. Update Draft

### `PUT /api/ai/drafts/:id`

Updates editable draft metadata. Automatically updates `updatedAt`.

#### Request Body (all fields optional)
```json
{
  "title": "Revised Headphones Launch",
  "generatedContent": "Updated marketing text for the campaign.",
  "hashtags": ["#Headphones", "#SpecialOffer"],
  "status": "reviewed",
  "media": [
    {
      "url": "https://images.example.com/promo.jpg",
      "type": "image"
    }
  ]
}
```

#### Success Response (200 OK)
Returns the full updated draft object.

---

## 6. Delete Draft

### `DELETE /api/ai/drafts/:id`

Deletes the draft from Firestore.

#### Success Response (200 OK)
```json
{
  "success": true
}
```

---

## 7. Regenerate Draft Content

### `POST /api/ai/drafts/:id/regenerate`

Re-runs the generation service using the draft's saved prompt settings (with optional parameter overrides), updates the draft's content and hashtags, and increments the `version` counter.

#### Request Body (optional)
```json
{
  "tone": "urgent",
  "platform": "twitter"
}
```

#### Success Response (200 OK)
Returns the updated draft with new `generatedContent`, new `hashtags`, refreshed `updatedAt`, and incremented `version` (e.g. `version: 2`).

---

## 8. List Scheduled Posts

### `GET /api/ai/schedule`

Retrieves all scheduled posts for the caller's organization, sorted chronologically by `scheduledTime` ascending.

#### Query Parameters
- `status` (string, optional): Filter by post status (`"draft"`, `"scheduled"`, `"published"`, `"failed"`).
- `platform` (string, optional): Filter by platform (`"instagram"`, `"twitter"`, `"linkedin"`, `"facebook"`, `"general"`).

#### Success Response (200 OK)
```json
[
  {
    "id": "sched_01HXYZ",
    "orgId": "org_123",
    "createdBy": "user_456",
    "draftId": "draft_01HXYZ",
    "topic": "Weekly Product Spotlight",
    "platform": "instagram",
    "content": "Check out our newest audio hardware release!",
    "hashtags": ["#Tech", "#Audio"],
    "media": [
      {
        "url": "https://example.com/banner.jpg",
        "type": "image"
      }
    ],
    "scheduledTime": 1792667428000,
    "scheduledIso": "2026-10-22T10:00:00.000Z",
    "timezone": "America/New_York",
    "status": "scheduled",
    "isSimulated": false,
    "createdAt": 1729600000000,
    "updatedAt": 1729600000000
  }
]
```

---

## 9. Create Scheduled Post

### `POST /api/ai/schedule`

Schedules a new social post. Can be created standalone or linked directly to an existing C2 draft via `draftId`. When `draftId` is provided, missing content, topic, hashtags, and media are inherited from the draft, and the draft's status transitions to `"scheduled"`.

#### Request Body
```json
{
  "draftId": "draft_01HXYZ",
  "topic": "Weekly Product Spotlight",
  "platform": "instagram",
  "content": "Check out our newest audio hardware release!",
  "hashtags": ["#Tech", "#Audio"],
  "media": [
    {
      "url": "https://example.com/banner.jpg",
      "type": "image"
    }
  ],
  "scheduledTime": 1792667428000,
  "timezone": "America/New_York",
  "status": "scheduled"
}
```

#### Field Specifications
- `draftId` (string, optional): ID of existing draft belonging to the organization.
- `topic` (string, required if not provided by draft): 1 to 500 characters.
- `content` (string, required if not provided by draft): 1 to 10000 characters.
- `platform` (string, optional): One of `"instagram"`, `"twitter"`, `"linkedin"`, `"facebook"`, `"general"`. Defaults to draft platform or `"general"`.
- `scheduledTime` (number or ISO string, required): Timestamp in milliseconds or valid ISO 8601 string.
- `timezone` (string, optional): IANA timezone string e.g. `"UTC"`, `"America/New_York"`. Defaults to `"UTC"`.
- `status` (string, optional): One of `"draft"`, `"scheduled"`. Defaults to `"scheduled"`.

#### Success Response (201 Created)
Returns the created scheduled post object with assigned Firestore `id`, `orgId`, `createdBy`, `isSimulated: false`, `createdAt`, and `updatedAt`.

---

## 10. Get Single Scheduled Post

### `GET /api/ai/schedule/:id`

Retrieves a single scheduled post. Returns `404` if the post does not exist or belongs to another organization.

#### Success Response (200 OK)
Returns the single scheduled post object.

---

## 11. Update Scheduled Post

### `PUT /api/ai/schedule/:id`

Updates scheduling details, content, or platform of an un-published post. If the post is already published (`status: "published"`), modifications are disallowed and rejected with `400 Bad Request`.

#### Request Body (all fields optional)
```json
{
  "topic": "Updated Launch Title",
  "content": "Revised post copy for the campaign.",
  "scheduledTime": 1792753828000,
  "timezone": "UTC",
  "status": "scheduled"
}
```

#### Success Response (200 OK)
Returns the full updated scheduled post object with refreshed `updatedAt`.

---

## 12. Delete Scheduled Post

### `DELETE /api/ai/schedule/:id`

Cancels and deletes a scheduled post from Firestore.

#### Success Response (200 OK)
```json
{
  "success": true
}
```

---

## 13. Publish Scheduled Post

### `POST /api/ai/schedule/:id/publish`

Triggers the publication of a scheduled post.

#### Duplicate Publishing & Safety
- If the post is already in `"published"` status, the request is rejected with `409 Conflict` to prevent duplicate publishing.
- When real platform credentials (`SOCIAL_PUBLISHING_API_KEY`) are not present, the system runs a realistic publishing simulation.
- The response and database document explicitly declare `isSimulated: true` so simulated posts are never misrepresented as real platform broadcasts.

#### Success Response (200 OK)
```json
{
  "post": {
    "id": "sched_01HXYZ",
    "orgId": "org_123",
    "createdBy": "user_456",
    "topic": "Weekly Product Spotlight",
    "platform": "instagram",
    "content": "Check out our newest audio hardware release!",
    "status": "published",
    "isSimulated": true,
    "publishedAt": 1729600500000,
    "updatedAt": 1729600500000
  },
  "isSimulated": true,
  "publishedAt": 1729600500000,
  "platformResponse": {
    "success": true,
    "simulated": true,
    "message": "Post successfully published to instagram via simulated gateway",
    "externalId": "sim_instagram_1729600500000_a1b2c3"
  }
}
```

---

## 14. Analyze and Save Sentiment

### `POST /api/ai/sentiment`

Analyzes customer feedback, social comments, or reviews for sentiment classification (`"positive"`, `"neutral"`, `"negative"`), confidence scoring, and key theme extraction. Persists the record to `aiSentimentResults`.

#### Request Body
```json
{
  "text": "Absolutely love this new content automation tool! Saved me hours.",
  "author": "Sarah K."
}
```

#### Field Specifications
- `text` (string, required): 1 to 5000 characters.
- `author` (string, optional): 1 to 100 characters.

#### Success Response (201 Created)
```json
{
  "id": "senti_01HXYZ",
  "orgId": "org_123",
  "createdBy": "user_456",
  "text": "Absolutely love this new content automation tool! Saved me hours.",
  "author": "Sarah K.",
  "sentiment": "positive",
  "score": 0.94,
  "keyThemes": [
    "automation",
    "time-saving",
    "usability"
  ],
  "provider": "gemini",
  "createdAt": 1729600000000
}
```
*Note: If Google Gemini is unavailable or offline, the system seamlessly falls back to the deterministic rule-based lexicon analyzer and reports `"provider": "mock"`.*

---

## 15. List Sentiment Records

### `GET /api/ai/sentiment`

Lists all sentiment analysis records for the caller's organization, ordered by `createdAt` descending.

#### Query Parameters
- `sentiment` (string, optional): Filter by sentiment category (`"positive"`, `"neutral"`, `"negative"`).

#### Success Response (200 OK)
Returns an array of sentiment result objects.

---

## 16. Sentiment Summary Analytics

### `GET /api/ai/sentiment/summary`

Aggregates all sentiment records belonging to the caller's organization to calculate total count, positive %, neutral %, and negative %. Powers the sentiment dashboard metrics cards directly.

#### Success Response (200 OK)
```json
{
  "total": 142,
  "positive": {
    "count": 97,
    "percentage": 68
  },
  "neutral": {
    "count": 31,
    "percentage": 22
  },
  "negative": {
    "count": 14,
    "percentage": 10
  }
}
```

---

## Standard Error Response Format

Errors are always returned as JSON with an `error` string:

```json
{
  "error": "Detailed error message"
}
```

### Common HTTP Status Codes
- `200 OK`: Request succeeded.
- `201 Created`: Resource successfully created.
- `400 Bad Request`: Validation failure (missing required field, invalid enum value).
- `401 Unauthorized`: Token missing, expired, or invalid.
- `403 Forbidden`: User has no organization or insufficient role.
- `404 Not Found`: Record not found or belongs to another organization.
- `500 Internal Server Error`: Unhandled server exception.
