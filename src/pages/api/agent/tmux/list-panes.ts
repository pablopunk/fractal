import type { APIRoute } from "astro";
import { listPanes, sanitizeSessionName } from "~/lib/server/tmux.js";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const body = (await request.json().catch(() => ({}))) as {
    session?: string;
  };

  if (!body.session?.trim()) {
    return Response.json({ error: "session required" }, { status: 400 });
  }

  const session = sanitizeSessionName(body.session.trim());
  if (!session) {
    return Response.json({ error: "invalid session name" }, { status: 400 });
  }

  try {
    const panes = await listPanes(session);
    return Response.json({ panes });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const status = msg.startsWith("session not found") ? 400 : 500;
    return Response.json({ error: msg }, { status });
  }
};
