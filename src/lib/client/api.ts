export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, message: string, body: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

function remoteToken(): string | null {
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
  const res = await fetch(url, { headers, ...init });
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
