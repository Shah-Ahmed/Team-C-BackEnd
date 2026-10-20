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

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/ai/generate` | Generate AI post captions, descriptions, hashtags, or campaign ideas. |
| `GET` | `/api/ai/drafts` | List all drafts belonging to the authenticated organization. |
| `POST` | `/api/ai/drafts` | Save a new draft to the library. |
| `GET` | `/api/ai/drafts/:id` | Retrieve a single draft by ID. |
| `PUT` | `/api/ai/drafts/:id` | Update an existing draft. |
| `DELETE` | `/api/ai/drafts/:id` | Delete a draft. |
| `POST` | `/api/ai/drafts/:id/regenerate` | Regenerate content for an existing draft and increment its version. |

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
