export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, message: string, body: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

export function remoteToken(): string | null {
  try {
    return localStorage.getItem("fractal:remoteToken");
  } catch {
    return null;
  }
}

export async function api<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  const token = remoteToken();
  if (token) headers.authorization = `Bearer ${token}`;
  if (init?.headers) {
    for (const [key, value] of Object.entries(init.headers)) {
      headers[key.toLowerCase()] = String(value);
    }
  }
  const res = await fetch(url, { ...init, headers });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const body = json as { error?: string; message?: string };
    throw new ApiError(
      res.status,
      body.error ?? body.message ?? text ?? `${res.status} ${res.statusText}`,
      json,
    );
  }
  return json as T;
}

export interface AgentSessionResponse {
  id: string;
  messages: unknown[];
}

export async function getFractalAgentSession(
  sessionId: string,
): Promise<AgentSessionResponse> {
  return api<AgentSessionResponse>(`/api/agent/sessions/${sessionId}`);
}

export interface FractalAgentChatStreamResult {
  stream: ReadableStream<Uint8Array>;
  sessionId: string;
}

export async function createFractalAgentChatStream({
  sessionId,
  prompt,
  signal,
}: {
  sessionId: string | null;
  prompt: string;
  signal?: AbortSignal;
}): Promise<FractalAgentChatStreamResult> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  const token = remoteToken();
  if (token) headers.authorization = `Bearer ${token}`;

  const res = await fetch("/api/agent/chat", {
    method: "POST",
    headers,
    body: JSON.stringify({ sessionId: sessionId ?? undefined, prompt }),
    signal,
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(
      (data as { error?: string }).error || `HTTP ${res.status}`,
    );
  }

  // Read session ID from response header (set on first turn)
  const newSessionId =
    res.headers.get("x-fractal-agent-session-id") ?? sessionId ?? "";

  const body = res.body;
  if (!body) throw new Error("No response body");

  return { stream: body, sessionId: newSessionId };
}
