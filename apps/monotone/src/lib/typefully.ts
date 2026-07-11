const TYPEFULLY_API = "https://api.typefully.com/v2";
const SOCIAL_SET_ID = "319788";

export async function createDraft(
  content: string,
  apiKey: string = process.env.TYPEFULLY_API_KEY || ""
): Promise<{ id: string }> {
  if (!apiKey) throw new Error("TYPEFULLY_API_KEY not set");

  const res = await fetch(`${TYPEFULLY_API}/social-sets/${SOCIAL_SET_ID}/drafts`, {
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
