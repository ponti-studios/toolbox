const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";

export interface OllamaResponse {
  model: string;
  response: string;
  prompt_eval_count?: number;
  eval_count?: number;
  total_duration?: number;
  prompt_eval_duration?: number;
  eval_duration?: number;
  done_reason?: string;
}

export async function generate(
  prompt: string,
  model: string = process.env.MODEL || "gemma4:e2b-mlx",
  format: string = ""
): Promise<OllamaResponse> {
  const body: Record<string, unknown> = { model, prompt, stream: false };
  if (format) body.format = format;

  const res = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Ollama error (${res.status}): ${text}`);
  }

  return res.json();
}
