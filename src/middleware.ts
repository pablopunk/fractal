import type { APIContext, MiddlewareNext } from "astro";
import { getSettings } from "~/lib/server/store.js";

const LOCALHOST_IPS = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

function extractToken(request: Request): string | null {
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) return authHeader.slice(7);

  const url = new URL(request.url);
  return url.searchParams.get("token");
}

function isLocalhost(request: Request): boolean {
  const hostname = new URL(request.url).hostname;
  return LOCALHOST_IPS.has(hostname) || hostname === "localhost";
}

function isApiPath(pathname: string): boolean {
  return pathname.startsWith("/api/") && pathname !== "/api/health";
}

export async function onRequest(context: APIContext, next: MiddlewareNext): Promise<Response> {
  if (!isApiPath(context.url.pathname)) return next();

  const settings = getSettings();

  if (!settings.remoteAccessEnabled) return next();

  if (isLocalhost(context.request)) return next();

  const token = extractToken(context.request);
  if (!token || token !== settings.remoteAccessToken) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  return next();
}
