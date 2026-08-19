// Shared HTTP fetch with timeout, auth, and error handling.
// Mirrors the Raycast Agent Usage `http.ts` patterns.
export interface HttpFetchOptions {
  url: string;
  method?: "GET" | "POST";
  token?: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  unauthorizedMessage?: string;
}

export interface HttpFetchError {
  type: "unauthorized" | "network_error" | "unknown";
  message: string;
}

export interface HttpFetchResult {
  data: unknown;
  error: HttpFetchError | null;
}

export function normalizeBearerToken(token: string): string {
  return token.startsWith("Bearer ") ? token : `Bearer ${token}`;
}

export async function httpFetch(options: HttpFetchOptions): Promise<HttpFetchResult> {
  const {
    url,
    method = "GET",
    token,
    headers = {},
    body,
    timeoutMs = 10_000,
    unauthorizedMessage = "Authorization token expired or invalid.",
  } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const allHeaders: Record<string, string> = { ...headers };
  if (token) {
    allHeaders["Authorization"] = token; // caller is responsible for scheme (Bearer, token, etc.)
  }

  try {
    const response = await fetch(url, {
      method,
      headers: allHeaders,
      body,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.status === 401 || response.status === 403) {
      return {
        data: null,
        error: { type: "unauthorized", message: unauthorizedMessage },
      };
    }

    if (!response.ok) {
      return {
        data: null,
        error: { type: "unknown", message: `HTTP ${response.status}: ${response.statusText}` },
      };
    }

    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const data = await response.json();
      return { data, error: null };
    }

    const text = await response.text();
    return { data: text, error: null };
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === "AbortError") {
      return { data: null, error: { type: "network_error", message: "Request timeout." } };
    }
    return {
      data: null,
      error: {
        type: "network_error",
        message: err instanceof Error ? err.message : "Network request failed",
      },
    };
  }
}
