import type { APIRoute } from "astro";
import { capturePane, sanitizeSessionName } from "~/lib/server/tmux.js";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const body = (await request.json().catch(() => ({}))) as {
    session?: string;
    target?: string;
    lines?: number;
  };

  if (!body.session?.trim()) {
    return Response.json({ error: "session required" }, { status: 400 });
  }

  const session = sanitizeSessionName(body.session.trim());
  if (!session) {
    return Response.json({ error: "invalid session name" }, { status: 400 });
  }

  const lines =
    typeof body.lines === "number" && Number.isFinite(body.lines)
      ? Math.min(10000, Math.max(1, Math.floor(body.lines)))
      : 50;

  try {
    const content = await capturePane(session, body.target, lines);
    return Response.json({ content });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const status = msg.startsWith("session not found") ? 400 : 500;
    return Response.json({ error: msg }, { status });
  }
};
