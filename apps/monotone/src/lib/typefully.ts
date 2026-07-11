const TYPEFULLY_API = "https://api.typefully.com/v2";

interface CreateDraftOptions {
  apiKey?: string;
  socialSetId?: string;
}

export async function createDraft(
  content: string,
  options: CreateDraftOptions = {}
): Promise<{ id: string }> {
  const apiKey = options.apiKey || process.env.TYPEFULLY_API_KEY || "";
  const socialSetId = options.socialSetId || process.env.TYPEFULLY_SOCIAL_SET_ID || "";
  if (!apiKey) throw new Error("TYPEFULLY_API_KEY not set");
  if (!socialSetId) {
    throw new Error("TYPEFULLY_SOCIAL_SET_ID not set. Pass --social-set <id> or add it to .env.");
  }

  const res = await fetch(`${TYPEFULLY_API}/social-sets/${socialSetId}/drafts`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      platforms: { x: { enabled: true, posts: [{ text: content }] } },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Typefully error (${res.status}): ${text}`);
  }

  return res.json();
}
