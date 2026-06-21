import type { APIRoute } from "astro";
import { evictSession, getSessionMessages } from "~/lib/server/fractal-agent-runtime.js";

export const prerender = false;

export const GET: APIRoute = async ({ params }) => {
  const id = params.id;
  if (!id) {
    return new Response(JSON.stringify({ error: "Session ID is required" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const messages = await getSessionMessages(id);

  if (messages === null) {
    return new Response(JSON.stringify({ error: "Session not found" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ id, messages }), {
    headers: { "content-type": "application/json" },
  });
};

export const DELETE: APIRoute = async ({ params }) => {
  const id = params.id;
  if (!id) {
    return new Response(JSON.stringify({ error: "Session ID is required" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  await evictSession(id);

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "content-type": "application/json" },
  });
};
